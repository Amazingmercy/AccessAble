// Comprehensive Automated Test Suite for AccessAble Banking
import assert from "node:assert";

const API = "http://localhost:4000";

async function runTests() {
  console.log("=== STARTING COMPLETE TEST SUITE FOR ACCESSABLE BANKING ===\n");

  // 1. Health check
  console.log("Test 1: Health check");
  const healthRes = await fetch(`${API}/api/health`);
  assert.strictEqual(healthRes.status, 200, "Health check must return 200");
  const health = await healthRes.json();
  assert.strictEqual(health.ok, true);
  console.log("✔ Health check passed:", health.service);

  // 2. Summary
  console.log("\nTest 2: Dashboard summary");
  const sumRes = await fetch(`${API}/api/dashboard/summary`);
  assert.strictEqual(sumRes.status, 200);
  const sum = await sumRes.json();
  assert(sum.totalCustomers >= 2, "Expected at least 2 demo customers");
  console.log("✔ Dashboard summary:", sum);

  // 3. Customer registration with accessibility preferences & multiple beneficiaries
  console.log("\nTest 3: Register a customer with accessibility preferences & beneficiaries");
  const testAccount = "AB-TEST-" + Math.floor(Math.random() * 9000 + 1000);
  const regPayload = {
    name: "Amina Yusuf",
    accountNumber: testAccount,
    phone: "08099887766",
    email: "amina@example.test",
    balance: 75000, // ₦75,000
    preferences: {
      voiceGuidance: true,
      speechRate: 0.94,
      textSize: "large",
      highContrast: true,
      screenReader: true,
      preferredInteractionMode: "voice_first"
    },
    beneficiaries: [
      { nickname: "Mama", accountHolderName: "Hadiza Yusuf", accountNumber: "1122334455", bankName: "Access Bank" },
      { nickname: "Brother", accountHolderName: "Tunde Yusuf", accountNumber: "9988776655", bankName: "Zenith Bank" }
    ]
  };

  const regRes = await fetch(`${API}/api/customers`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(regPayload)
  });
  assert.strictEqual(regRes.status, 201, "Customer registration should return 201");
  const regData = await regRes.json();
  assert(regData.success, "Registration success must be true");
  const newCustomerId = regData.customer.id;
  const activationUrl = regData.activationUrl;
  assert(activationUrl.includes("/activate/"), "Activation URL should contain /activate/");
  const token = activationUrl.split("/activate/")[1];
  console.log("✔ Customer registered successfully. ID:", newCustomerId, "Activation token:", token);

  // 4. Retrieve single customer details
  console.log("\nTest 4: Retrieve customer details");
  const custRes = await fetch(`${API}/api/customers/${newCustomerId}`);
  assert.strictEqual(custRes.status, 200);
  const custDetails = await custRes.json();
  assert.strictEqual(custDetails.customer.name, "Amina Yusuf");
  assert.strictEqual(custDetails.customer.accountNumber, testAccount);
  assert.strictEqual(custDetails.customer.balance, 7500000); // 75,000 * 100 kobo
  assert.strictEqual(custDetails.accessibilityPreferences.textSize, "large");
  assert.strictEqual(custDetails.accessibilityPreferences.highContrast, true);
  assert.strictEqual(custDetails.beneficiaries.length, 2);
  console.log("✔ Customer details verified with preferences and 2 beneficiaries.");

  // 5. Edit customer details
  console.log("\nTest 5: Edit customer details");
  const editRes = await fetch(`${API}/api/customers/${newCustomerId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Amina Yusuf Bello",
      phone: "08011223344",
      email: "amina.bello@example.test",
      balance: 80000 // updated to ₦80,000
    })
  });
  assert.strictEqual(editRes.status, 200);
  const editData = await editRes.json();
  assert.strictEqual(editData.customer.name, "Amina Yusuf Bello");
  assert.strictEqual(editData.customer.balance, 8000000);
  console.log("✔ Customer details updated.");

  // 6. Edit customer accessibility preferences
  console.log("\nTest 6: Update customer accessibility preferences");
  const prefRes = await fetch(`${API}/api/customers/${newCustomerId}/preferences`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      voiceGuidance: true,
      speechRate: 1.2,
      textSize: "extra-large",
      highContrast: false,
      screenReader: true,
      preferredInteractionMode: "voice_first"
    })
  });
  assert.strictEqual(prefRes.status, 200);
  const prefData = await prefRes.json();
  assert.strictEqual(prefData.accessibilityPreferences.speechRate, 1.2);
  assert.strictEqual(prefData.accessibilityPreferences.textSize, "extra-large");
  console.log("✔ Accessibility preferences updated.");

  // 7. Add, update, and remove a beneficiary
  console.log("\nTest 7: Beneficiary CRUD operations");
  const addBenRes = await fetch(`${API}/api/customers/${newCustomerId}/beneficiaries`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      nickname: "Landlord",
      accountHolderName: "Chief Okon",
      accountNumber: "5544332211",
      bankName: "First Bank"
    })
  });
  assert.strictEqual(addBenRes.status, 201);
  const newBen = (await addBenRes.json()).beneficiary;
  assert.strictEqual(newBen.nickname, "Landlord");
  console.log("✔ Beneficiary added: Landlord");

  // Edit beneficiary
  const editBenRes = await fetch(`${API}/api/customers/${newCustomerId}/beneficiaries/${newBen.id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      nickname: "Landlord Old",
      accountHolderName: "Chief Okon",
      accountNumber: "5544332211",
      bankName: "First Bank of Nigeria"
    })
  });
  assert.strictEqual(editBenRes.status, 200);
  console.log("✔ Beneficiary edited.");

  // Delete beneficiary
  const delBenRes = await fetch(`${API}/api/customers/${newCustomerId}/beneficiaries/${newBen.id}`, {
    method: "DELETE"
  });
  assert.strictEqual(delBenRes.status, 200);
  console.log("✔ Beneficiary removed.");

  // 8. NFC Activation token resolution
  console.log("\nTest 8: NFC token resolution");
  const actRes = await fetch(`${API}/api/activate/${token}`);
  assert.strictEqual(actRes.status, 200);
  const actData = await actRes.json();
  assert.strictEqual(actData.customer.name, "Amina Yusuf Bello");
  assert.strictEqual(actData.accessibilityPreferences.textSize, "extra-large");
  console.log("✔ NFC activation token resolved to customer profile & preferences.");

  // 9. Customer Authentication & Fallback
  console.log("\nTest 9: Authenticate customer session");
  const authRes = await fetch(`${API}/api/auth/fallback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token })
  });
  assert.strictEqual(authRes.status, 200);
  const authData = await authRes.json();
  const sessionToken = authData.token;
  assert(sessionToken, "Session JWT token must be returned");
  console.log("✔ Customer authenticated and session token issued.");

  // 10. Authenticated Customer Profile & Beneficiaries
  console.log("\nTest 10: Authenticated /api/me & /api/me/beneficiaries");
  const meRes = await fetch(`${API}/api/me`, {
    headers: { Authorization: `Bearer ${sessionToken}` }
  });
  assert.strictEqual(meRes.status, 200);
  const meData = await meRes.json();
  assert.strictEqual(meData.customer.id, newCustomerId);

  const meBenRes = await fetch(`${API}/api/me/beneficiaries`, {
    headers: { Authorization: `Bearer ${sessionToken}` }
  });
  assert.strictEqual(meBenRes.status, 200);
  const meBens = await meBenRes.json();
  assert(meBens.length >= 2, "Customer should have at least 2 beneficiaries");
  const mamaBen = meBens.find(b => b.nickname.toLowerCase() === "mama");
  assert(mamaBen, "Beneficiary 'Mama' must exist for voice resolution");
  console.log("✔ Authenticated customer and beneficiaries retrieved. Found 'Mama':", mamaBen.accountHolderName);

  // 11. Simulated Money Transfer using Nickname
  console.log("\nTest 11: Execute transfer to 'Mama'");
  const transferRes = await fetch(`${API}/api/me/transfer`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${sessionToken}`
    },
    body: JSON.stringify({
      beneficiaryId: mamaBen.id,
      amount: 5000 // ₦5,000
    })
  });
  assert.strictEqual(transferRes.status, 200);
  const transferData = await transferRes.json();
  assert.strictEqual(transferData.success, true);
  assert(transferData.reference.startsWith("TXN-"), "Reference must start with TXN-");
  assert.strictEqual(transferData.amount, 500000); // ₦5,000 in kobo
  console.log("✔ Transfer successful! Ref:", transferData.reference, "New balance:", transferData.formattedBalance);

  // 12. Insufficient Balance Validation
  console.log("\nTest 12: Insufficient balance validation");
  const failTransferRes = await fetch(`${API}/api/me/transfer`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${sessionToken}`
    },
    body: JSON.stringify({
      beneficiaryId: mamaBen.id,
      amount: 99999999 // huge amount
    })
  });
  assert.strictEqual(failTransferRes.status, 400);
  const failData = await failTransferRes.json();
  assert(failData.error.toLowerCase().includes("insufficient"), "Must return insufficient balance error");
  console.log("✔ Insufficient balance properly rejected:", failData.error);

  // 13. Invalid Beneficiary Validation
  console.log("\nTest 13: Invalid beneficiary validation");
  const invalidBenRes = await fetch(`${API}/api/me/transfer`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${sessionToken}`
    },
    body: JSON.stringify({
      beneficiaryId: "non-existent-beneficiary-id",
      amount: 1000
    })
  });
  assert.strictEqual(invalidBenRes.status, 400);
  console.log("✔ Invalid beneficiary properly rejected.");

  // 14. Customer Transaction History
  console.log("\nTest 14: Customer transaction history");
  const meTxRes = await fetch(`${API}/api/me/transactions`, {
    headers: { Authorization: `Bearer ${sessionToken}` }
  });
  assert.strictEqual(meTxRes.status, 200);
  const meTxs = await meTxRes.json();
  assert(meTxs.length >= 1, "Customer should have at least 1 transaction");
  assert.strictEqual(meTxs[0].reference, transferData.reference);
  console.log("✔ Customer transactions verified. Latest ref:", meTxs[0].reference);

  // 15. Dashboard Transactions Sync
  console.log("\nTest 15: Verify dashboard transactions sync");
  const dashTxRes = await fetch(`${API}/api/dashboard/transactions`);
  assert.strictEqual(dashTxRes.status, 200);
  const dashTxs = await dashTxRes.json();
  const matchedTx = dashTxs.find(t => t.reference === transferData.reference);
  assert(matchedTx, "Transaction must appear in dashboard transactions list");
  assert.strictEqual(matchedTx.customerName, "Amina Yusuf Bello");
  console.log("✔ Dashboard synced with customer transaction:", matchedTx.reference);

  // 16. Customer Deactivation & Security
  console.log("\nTest 16: Customer deactivation and rejection of deactivated token");
  const deactRes = await fetch(`${API}/api/customers/${newCustomerId}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "deactivated" })
  });
  assert.strictEqual(deactRes.status, 200);

  // Attempt to resolve deactivated token
  const deactActRes = await fetch(`${API}/api/activate/${token}`);
  assert.strictEqual(deactActRes.status, 403, "Deactivated customer token must return 403");
  console.log("✔ Deactivated token rejected with 403 Forbidden as expected.");

  // Reactivate customer
  console.log("\nTest 17: Reactivate customer");
  const reactRes = await fetch(`${API}/api/customers/${newCustomerId}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "active" })
  });
  assert.strictEqual(reactRes.status, 200);
  const reactActRes = await fetch(`${API}/api/activate/${token}`);
  assert.strictEqual(reactActRes.status, 200);
  console.log("✔ Customer reactivated and token resolution restored.");

  // 17. Security Settings & Demo Reset
  console.log("\nTest 17: Security settings endpoint");
  const secRes = await fetch(`${API}/api/dashboard/security-settings`);
  assert.strictEqual(secRes.status, 200);
  const secData = await secRes.json();
  assert.strictEqual(secData.userVerification, "required");
  assert.strictEqual(secData.spokenPinPolicy, "strictly_disallowed");
  console.log("✔ Prototype security parameters verified.");

  console.log("\nTest 18: Reset demo data endpoint");
  const resetRes = await fetch(`${API}/api/dashboard/reset-demo`, { method: "POST" });
  assert.strictEqual(resetRes.status, 200);
  const resetData = await resetRes.json();
  assert.strictEqual(resetData.success, true);
  console.log("✔ Reset demo data verified.");

  console.log("\n=======================================================");
  console.log("ALL TESTS COMPLETED SUCCESSFULLY WITH 100% PASS RATE!");
  console.log("=======================================================");
}

runTests().catch(err => {
  console.error("\n❌ TEST SUITE FAILED:", err);
  process.exit(1);
});
