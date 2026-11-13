import "dotenv/config";
import express from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import {
  generateRegistrationOptions, verifyRegistrationResponse,
  generateAuthenticationOptions, verifyAuthenticationResponse
} from "@simplewebauthn/server";
import { initDb, query, one, run } from "./db.js";

const app = express();
const PORT = Number(process.env.PORT || 4000);
const RP_NAME = process.env.RP_NAME || "AccessAble Banking";
const RP_ID = process.env.RP_ID || "localhost";
const ORIGIN = process.env.EXPECTED_ORIGIN || "http://localhost:5174";
const JWT_SECRET = process.env.JWT_SECRET || "development-only-change-me";
const PUBLIC_CUSTOMER_URL = process.env.PUBLIC_CUSTOMER_URL || "http://localhost:5174";
const challenges = new Map();

app.use(cors({ origin: true }));
app.use(express.json({ limit: "1mb" }));

const safeCustomer = c => ({
  id:c.id, name:c.name, accountNumber:c.account_number, phone:c.phone,
  email:c.email, balance:c.balance, status:c.status
});
const money = n => `₦${(Number(n)/100).toLocaleString("en-NG",{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const auth = (req,res,next) => {
  const token=(req.headers.authorization||"").replace(/^Bearer\s+/i,"");
  try { req.session=jwt.verify(token,JWT_SECRET); next(); }
  catch { res.status(401).json({error:"Please authenticate again."}); }
};
const staffDemo = (req,res,next) => {
  // Prototype-only staff access. Replace with real staff authentication before deployment.
  req.staff={id:"demo-staff"}; next();
};

app.get("/api/health",(req,res)=>res.json({ok:true,service:"AccessAble API"}));

app.get("/api/dashboard/summary",staffDemo,(req,res)=>{
  const customers=one("SELECT COUNT(*) AS n FROM customers");
  const active=one("SELECT COUNT(*) AS n FROM customers WHERE status='active'");
  const tx=one("SELECT COUNT(*) AS n FROM transactions");
  const volume=one("SELECT COALESCE(SUM(amount),0) AS n FROM transactions WHERE type='debit' AND status='successful'");
  res.json({totalCustomers:customers.n,activeCustomers:active.n,transactions:tx.n,transferVolume:volume.n});
});
app.get("/api/customers",staffDemo,(req,res)=>{
  const rows=query(`SELECT c.*,(SELECT COUNT(*) FROM credentials k WHERE k.customer_id=c.id) AS passkeys
    FROM customers c ORDER BY c.created_at DESC`);
  res.json(rows.map(c=>({...safeCustomer(c),passkeyRegistered:Number(c.passkeys)>0,createdAt:c.created_at})));
});
app.post("/api/customers",staffDemo,(req,res)=>{
  const {name,phone="",email="",accountNumber,balance=0}=req.body||{};
  if(!name?.trim()||!accountNumber?.trim()) return res.status(400).json({error:"Name and account number are required."});
  const id=randomUUID(), token=randomUUID().replaceAll("-","");
  try {
    run("INSERT INTO customers (id,name,account_number,phone,email,balance,activation_token,status,created_at) VALUES (?,?,?,?,?,?,?,?,?)",
      [id,name.trim(),accountNumber.trim(),phone,email,Math.max(0,Math.round(Number(balance)*100)),token,"active",new Date().toISOString()]);
    res.status(201).json({customer:{id,name:name.trim(),accountNumber,phone,email},activationUrl:`${PUBLIC_CUSTOMER_URL}/activate/${token}`});
  } catch { res.status(409).json({error:"That account number is already registered."}); }
});
app.post("/api/customers/:id/activation-link",staffDemo,(req,res)=>{
  const c=one("SELECT activation_token FROM customers WHERE id=?",[req.params.id]);
  if(!c) return res.status(404).json({error:"Customer not found."});
  res.json({activationUrl:`${PUBLIC_CUSTOMER_URL}/activate/${c.activation_token}`});
});
app.get("/api/activate/:token",(req,res)=>{
  const c=one("SELECT * FROM customers WHERE activation_token=? AND status='active'",[req.params.token]);
  if(!c) return res.status(404).json({error:"This activation link is invalid or inactive."});
  const credential=one("SELECT credential_id FROM credentials WHERE customer_id=? LIMIT 1",[c.id]);
  res.json({customer:safeCustomer(c),hasPasskey:!!credential});
});

app.post("/api/webauthn/register/options",async(req,res)=>{
  try {
    const c=one("SELECT * FROM customers WHERE activation_token=? AND status='active'",[req.body.token]);
    if(!c) return res.status(404).json({error:"Activation link not found."});
    const existing=query("SELECT credential_id FROM credentials WHERE customer_id=?",[c.id]).map(x=>({id:x.credential_id, type:"public-key"}));
    const options=await generateRegistrationOptions({
      rpName:RP_NAME,rpID:RP_ID,userName:c.account_number,userDisplayName:c.name,
      userID:new TextEncoder().encode(c.id),attestationType:"none",
      excludeCredentials:existing,authenticatorSelection:{
        authenticatorAttachment:"platform",residentKey:"preferred",userVerification:"required"
      }
    });
    challenges.set(`reg:${c.id}`,options.challenge);
    res.json(options);
  } catch(e) { console.error(e); res.status(500).json({error:"Could not start biometric registration."}); }
});
app.post("/api/webauthn/register/verify",async(req,res)=>{
  try {
    const c=one("SELECT * FROM customers WHERE activation_token=? AND status='active'",[req.body.token]);
    if(!c) return res.status(404).json({error:"Activation link not found."});
    const expectedChallenge=challenges.get(`reg:${c.id}`);
    const verification=await verifyRegistrationResponse({
      response:req.body.response,expectedChallenge,expectedOrigin:ORIGIN,expectedRPID:RP_ID,
      requireUserVerification:true
    });
    challenges.delete(`reg:${c.id}`);
    if(!verification.verified||!verification.registrationInfo) return res.status(400).json({error:"Biometric registration was not verified."});
    const info=verification.registrationInfo;
    const credential=info.credential || {
      id: info.credentialID ? Buffer.from(info.credentialID).toString("base64url") : req.body.response.id,
      publicKey: info.credentialPublicKey,
      counter: info.counter
    };
    const credentialId=credential.id;
    const publicKey=Buffer.from(credential.publicKey).toString("base64");
    run("INSERT OR REPLACE INTO credentials (id,customer_id,credential_id,public_key,counter,transports) VALUES (?,?,?,?,?,?)",
      [randomUUID(),c.id,credentialId,publicKey,credential.counter||0,JSON.stringify(req.body.response.response?.transports||[])]);
    const token=jwt.sign({sub:c.id},JWT_SECRET,{expiresIn:"20m"});
    res.json({verified:true,token,customer:safeCustomer(c)});
  } catch(e) { console.error(e); res.status(400).json({error:"Biometric registration failed. Please try again."}); }
});
app.post("/api/webauthn/auth/options",async(req,res)=>{
  try {
    const c=one("SELECT * FROM customers WHERE activation_token=? AND status='active'",[req.body.token]);
    if(!c) return res.status(404).json({error:"Activation link not found."});
    const credentials=query("SELECT * FROM credentials WHERE customer_id=?",[c.id]);
    if(!credentials.length) return res.status(409).json({error:"No passkey is registered for this customer yet."});
    const options=await generateAuthenticationOptions({
      rpID:RP_ID,allowCredentials:credentials.map(k=>({id:k.credential_id,type:"public-key",transports:JSON.parse(k.transports||"[]")})),
      userVerification:"required"
    });
    challenges.set(`auth:${c.id}`,options.challenge);
    res.json(options);
  } catch(e) { console.error(e); res.status(500).json({error:"Could not start authentication."}); }
});
app.post("/api/webauthn/auth/verify",async(req,res)=>{
  try {
    const c=one("SELECT * FROM customers WHERE activation_token=? AND status='active'",[req.body.token]);
    if(!c) return res.status(404).json({error:"Activation link not found."});
    const stored=one("SELECT * FROM credentials WHERE customer_id=? AND credential_id=?",[c.id,req.body.response.id]);
    if(!stored) return res.status(401).json({error:"This device is not registered."});
    const expectedChallenge=challenges.get(`auth:${c.id}`);
    const verification=await verifyAuthenticationResponse({
      response:req.body.response,expectedChallenge,expectedOrigin:ORIGIN,expectedRPID:RP_ID,
      credential:{id:stored.credential_id,publicKey:Buffer.from(stored.public_key,"base64"),counter:stored.counter,transports:JSON.parse(stored.transports||"[]")},
      requireUserVerification:true
    });
    challenges.delete(`auth:${c.id}`);
    if(!verification.verified) return res.status(401).json({error:"Biometric verification failed."});
    run("UPDATE credentials SET counter=? WHERE id=?",[verification.authenticationInfo.newCounter,stored.id]);
    const token=jwt.sign({sub:c.id},JWT_SECRET,{expiresIn:"20m"});
    res.json({verified:true,token,customer:safeCustomer(c)});
  } catch(e) { console.error(e); res.status(401).json({error:"Could not verify this device. Try again."}); }
});

app.get("/api/me",auth,(req,res)=>{
  const c=one("SELECT * FROM customers WHERE id=?",[req.session.sub]);
  if(!c) return res.status(404).json({error:"Customer not found."});
  res.json({customer:safeCustomer(c)});
});
app.get("/api/me/beneficiaries",auth,(req,res)=>res.json(query("SELECT id,name,account_number AS accountNumber,bank_name AS bankName FROM beneficiaries WHERE customer_id=?",[req.session.sub])));
app.get("/api/me/transactions",auth,(req,res)=>res.json(query("SELECT id,type,description,amount,status,created_at AS createdAt FROM transactions WHERE customer_id=? ORDER BY created_at DESC LIMIT 10",[req.session.sub]).map(t=>({...t,amount:money(t.amount)}))));
app.post("/api/me/transfer",auth,(req,res)=>{
  const {beneficiaryId,amount}=req.body||{};
  const b=one("SELECT * FROM beneficiaries WHERE id=? AND customer_id=?",[beneficiaryId,req.session.sub]);
  const c=one("SELECT * FROM customers WHERE id=?",[req.session.sub]);
  const kobo=Math.round(Number(amount)*100);
  if(!b) return res.status(400).json({error:"Saved beneficiary not found."});
  if(!Number.isFinite(kobo)||kobo<=0) return res.status(400).json({error:"Enter a valid transfer amount."});
  if(kobo>c.balance) return res.status(400).json({error:"Insufficient available balance."});
  run("UPDATE customers SET balance=balance-? WHERE id=?",[kobo,c.id]);
  run("INSERT INTO transactions (id,customer_id,type,description,amount,status,created_at) VALUES (?,?,?,?,?,?,?)",
    [randomUUID(),c.id,"debit",`Transfer to ${b.name}`,kobo,"successful",new Date().toISOString()]);
  res.json({success:true,message:`Your transfer of ${money(kobo)} to ${b.name} was successful.`,balance:c.balance-kobo});
});

app.use((err,req,res,next)=>{ console.error(err); res.status(500).json({error:"Something went wrong."}); });
await initDb();
app.listen(PORT,()=>console.log(`AccessAble API running at http://localhost:${PORT}`));
