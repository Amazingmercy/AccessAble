import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { startRegistration, startAuthentication } from '@simplewebauthn/browser';
import {
  Mic, MicOff, ShieldCheck, Volume2, VolumeX, Wallet, ArrowLeftRight,
  History, HelpCircle, CheckCircle2, AlertCircle, LoaderCircle, LockKeyhole,
  MessageCircle, ArrowUpRight, LogOut, Receipt, Users, Sun, Type, Send
} from 'lucide-react';
import './style.css';

const API = import.meta.env.VITE_API_URL || 'http://localhost:4000';

const fmt = n => new Intl.NumberFormat('en-NG', {
  style: 'currency',
  currency: 'NGN',
  minimumFractionDigits: 2
}).format(Number(n || 0) / 100);

const getToken = () => {
  const pathMatch = location.pathname.match(/\/activate\/([^/]+)/);
  if (pathMatch?.[1]) return pathMatch[1];
  return new URLSearchParams(location.search).get('token') || '';
};

function App() {
  const activationToken = getToken();
  const [phase, setPhase] = useState('loading'); // loading, home, error, enroll, authenticate, ready
  const [customer, setCustomer] = useState(null);
  const [session, setSession] = useState('');
  const [message, setMessage] = useState('Connecting to your secure banking access.');
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [voice, setVoice] = useState(true);
  const [speechRate, setSpeechRate] = useState(1.0);
  const [textSize, setTextSize] = useState('normal'); // normal, large, extra-large
  const [highContrast, setHighContrast] = useState(false);
  const [screenReaderActive, setScreenReaderActive] = useState(true);
  const [interactionMode, setInteractionMode] = useState('voice_first');

  const [history, setHistory] = useState([]);
  const [balance, setBalance] = useState(null);
  const [beneficiaries, setBeneficiaries] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [manual, setManual] = useState(false);
  const [latestReceipt, setLatestReceipt] = useState(null);

  const recognition = useRef(null);
  const dialog = useRef({
    step: 'idle', // idle, beneficiary, amount, confirm
    beneficiary: null,
    amount: null
  });
  const voiceRef = useRef(voice);
  const speechRateRef = useRef(speechRate);
  const interactionModeRef = useRef(interactionMode);

  useEffect(() => { voiceRef.current = voice; }, [voice]);
  useEffect(() => { speechRateRef.current = speechRate; }, [speechRate]);
  useEffect(() => { interactionModeRef.current = interactionMode; }, [interactionMode]);

  // Apply accessibility preferences from customer record
  function applyPreferences(prefs) {
    if (!prefs) return;
    if (prefs.voiceGuidance !== undefined) setVoice(Boolean(prefs.voiceGuidance));
    if (prefs.speechRate) setSpeechRate(Number(prefs.speechRate));
    if (prefs.textSize) setTextSize(prefs.textSize);
    if (prefs.highContrast !== undefined) setHighContrast(Boolean(prefs.highContrast));
    if (prefs.screenReader !== undefined) setScreenReaderActive(Boolean(prefs.screenReader));
    if (prefs.preferredInteractionMode) setInteractionMode(prefs.preferredInteractionMode);
  }

  // Voice speech synthesis
  const speak = (text, listenAfter = true) => {
    setMessage(text);
    if (!voiceRef.current) {
      if (listenAfter && interactionModeRef.current === 'voice_first') {
        setTimeout(startListening, 300);
      }
      return;
    }

    try {
      window.speechSynthesis?.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-NG';
      u.rate = speechRateRef.current || 0.94;
      u.onend = () => {
        if (listenAfter && interactionModeRef.current === 'voice_first') {
          setTimeout(startListening, 350);
        }
      };
      u.onerror = () => {
        if (listenAfter && interactionModeRef.current === 'voice_first') {
          setTimeout(startListening, 350);
        }
      };
      window.speechSynthesis?.speak(u);
    } catch {
      if (listenAfter && interactionModeRef.current === 'voice_first') {
        setTimeout(startListening, 350);
      }
    }
  };

  async function api(path, opts = {}) {
    const r = await fetch(API + path, {
      ...opts,
      headers: {
        'Content-Type': 'application/json',
        ...(session ? { Authorization: 'Bearer ' + session } : {}),
        ...(opts.headers || {})
      }
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'Request failed');
    return d;
  }

  // Initial load & NFC token validation
  useEffect(() => {
    (async () => {
      try {
        if (!activationToken) {
          setPhase('home');
          setMessage('Welcome to AccessAble Banking. Tap your bank-issued AccessAble NFC tag to begin.');
          return;
        }

        const d = await api('/api/activate/' + activationToken);
        setCustomer(d.customer);
        applyPreferences(d.accessibilityPreferences);

        const firstName = d.customer.name.split(' ')[0];
        if (d.hasPasskey) {
          setPhase('authenticate');
          setMessage(`Welcome back, ${firstName}. Please verify your identity using your device biometric or screen lock to continue.`);
        } else {
          setPhase('enroll');
          setMessage(`Welcome to AccessAble Banking, ${firstName}. Let's securely register this phone with a passkey for instant biometric sign-in.`);
        }
      } catch (e) {
        setPhase('error');
        setMessage(e.message || 'We could not open your banking access. Please contact your bank branch.');
      }
    })();
  }, [activationToken]);

  // Biometric registration (WebAuthn passkey)
  async function enroll() {
    try {
      setBusy(true);
      const options = await api('/api/webauthn/register/options', {
        method: 'POST',
        body: JSON.stringify({ token: activationToken })
      });
      const response = await startRegistration({ optionsJSON: options });
      const result = await api('/api/webauthn/register/verify', {
        method: 'POST',
        body: JSON.stringify({ token: activationToken, response })
      });
      await enterApp(result);
    } catch (e) {
      console.warn('Biometric registration error:', e);
      speak(e.message || 'Biometric registration was not completed. You can try again or use platform verification.', false);
    } finally {
      setBusy(false);
    }
  }

  // Biometric authentication (WebAuthn passkey)
  async function authenticate() {
    try {
      setBusy(true);
      const options = await api('/api/webauthn/auth/options', {
        method: 'POST',
        body: JSON.stringify({ token: activationToken })
      });
      const response = await startAuthentication({ optionsJSON: options });
      const result = await api('/api/webauthn/auth/verify', {
        method: 'POST',
        body: JSON.stringify({ token: activationToken, response })
      });
      await enterApp(result);
    } catch (e) {
      console.warn('Biometric auth error:', e);
      speak(e.message || 'Biometric authentication was not completed. You can try again or use device verification.', false);
    } finally {
      setBusy(false);
    }
  }

  // Fallback platform authentication for unsupported/desktop browsers
  async function fallbackAuth() {
    try {
      setBusy(true);
      const result = await api('/api/auth/fallback', {
        method: 'POST',
        body: JSON.stringify({ token: activationToken })
      });
      await enterApp(result);
    } catch (e) {
      speak(e.message || 'Authentication failed. Please check your activation link.', false);
    } finally {
      setBusy(false);
    }
  }

  // Successfully authenticated into customer banking
  async function enterApp(result) {
    setSession(result.token);
    setCustomer(result.customer);
    applyPreferences(result.accessibilityPreferences);
    setPhase('ready');

    const h = { Authorization: 'Bearer ' + result.token };
    try {
      const [meRes, bRes, tRes] = await Promise.all([
        fetch(API + '/api/me', { headers: h }).then(r => r.json()),
        fetch(API + '/api/me/beneficiaries', { headers: h }).then(r => r.json()),
        fetch(API + '/api/me/transactions', { headers: h }).then(r => r.json())
      ]);

      setCustomer(meRes.customer);
      setBalance(meRes.customer.balance);
      setBeneficiaries(Array.isArray(bRes) ? bRes : []);
      setTransactions(Array.isArray(tRes) ? tRes : []);
      applyPreferences(meRes.accessibilityPreferences);

      const firstName = meRes.customer.name.split(' ')[0];
      const greeting = `Welcome, ${firstName}. What would you like to do?`;
      speak(greeting, true);
    } catch (err) {
      console.error('Error fetching customer data:', err);
      speak('Welcome. Your banking session is ready. What would you like to do?', true);
    }
  }

  // Voice speech recognition
  function startListening() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setManual(true);
      setListening(false);
      return;
    }
    try {
      if (recognition.current) {
        recognition.current.abort();
      }
      const r = new SR();
      r.lang = 'en-NG';
      r.continuous = false;
      r.interimResults = false;
      r.maxAlternatives = 1;
      r.onstart = () => setListening(true);
      r.onend = () => setListening(false);
      r.onerror = e => {
        setListening(false);
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
          setManual(true);
          setMessage('Microphone permission is needed for voice. You can type commands below.');
        }
      };
      r.onresult = e => {
        const transcript = e.results[0][0].transcript;
        handleCommand(transcript);
      };
      recognition.current = r;
      r.start();
    } catch {
      setManual(true);
      setListening(false);
    }
  }

  // Spoken amount parser supporting Nigerian speech and numbers
  function parseAmount(text) {
    const words = {
      zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
      eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
      eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60,
      seventy: 70, eighty: 80, ninety: 90, hundred: 100, thousand: 1000, million: 1000000
    };

    let s = text.toLowerCase()
      .replace(/,/g, '')
      .replace(/₦|naira|naria|kobo/g, ' ')
      .replace(/\b(send|transfer|please|to|just|like)\b/g, ' ')
      .trim();

    // Check for "50k", "5k", etc.
    const kMatch = s.match(/(\d+(?:\.\d+)?)\s*k\b/i);
    if (kMatch) return Number(kMatch[1]) * 1000;

    // Check for "2m", "1.5m", etc.
    const mMatch = s.match(/(\d+(?:\.\d+)?)\s*m\b/i);
    if (mMatch) return Number(mMatch[1]) * 1000000;

    // Check for plain digits e.g. "5000"
    const digits = s.match(/\b\d+(?:\.\d+)?\b/);
    if (digits) return Number(digits[0]);

    // Parse written words
    let total = 0;
    let current = 0;
    let found = false;

    for (const w of s.split(/\s+/)) {
      if (words[w] !== undefined) {
        found = true;
        const val = words[w];
        if (val === 100) {
          current = (current || 1) * 100;
        } else if (val === 1000) {
          total += (current || 1) * 1000;
          current = 0;
        } else if (val === 1000000) {
          total += (current || 1) * 1000000;
          current = 0;
        } else {
          current += val;
        }
      }
    }

    if (found) return total + current;
    return null;
  }

  const NICKNAME_SYNONYMS = {
    mama: ['mama', 'mommy', 'mummy', 'mum', 'mom', 'mother', 'mami', 'iya', 'nne'],
    mommy: ['mama', 'mommy', 'mummy', 'mum', 'mom', 'mother', 'mami', 'iya', 'nne'],
    mummy: ['mama', 'mommy', 'mummy', 'mum', 'mom', 'mother', 'mami', 'iya', 'nne'],
    papa: ['papa', 'daddy', 'dad', 'father', 'pops', 'baba', 'papi'],
    daddy: ['papa', 'daddy', 'dad', 'father', 'pops', 'baba', 'papi'],
    brother: ['brother', 'bro', 'brah'],
    bro: ['brother', 'bro', 'brah'],
    sister: ['sister', 'sis']
  };

  function cleanBeneficiaryQuery(raw) {
    if (!raw) return '';
    let s = raw.toLowerCase()
      .replace(/\b(to send to|send money to|send money give|make you send to|i wan send to|i wan transfer to|wan send to|wan transfer to|transfer money to|transfer to|transfer give|send to|send give|send am give|send am to|send am|pay to|pay|give to|give|for|abeg|please|oya|i want to send to|i want to transfer to)\b/gi, ' ')
      .replace(/[,.?!/\\#$%\^&*;:{}=\-_`~()]/g, ' ')
      .trim();

    const words = s.split(/\s+/).filter(Boolean);
    if (words.length > 1 && new Set(words).size === 1) {
      return words[0];
    }
    const unique = [...new Set(words)];
    if (unique.length === 1 && unique[0].length >= 3) {
      return unique[0];
    }
    return s;
  }

  // Beneficiary nickname resolution with phonetic tolerance and Nigerian synonyms
  function resolveBeneficiary(rawText) {
    if (!beneficiaries.length) return { status: 'empty', cleanedName: rawText };
    const clean = cleanBeneficiaryQuery(rawText);
    const lower = clean.toLowerCase();

    // 1. Direct or substring match on nickname
    const exactNickname = beneficiaries.filter(b => {
      const nick = (b.nickname || b.name || '').toLowerCase();
      return nick && (lower.includes(nick) || nick.includes(lower));
    });
    if (exactNickname.length === 1) return { status: 'matched', beneficiary: exactNickname[0], cleanedName: clean };
    if (exactNickname.length > 1) return { status: 'ambiguous', matches: exactNickname, cleanedName: clean };

    // 2. Synonym match (e.g. Mama <-> Mommy / Mummy / Mum)
    const synonymMatches = beneficiaries.filter(b => {
      const nick = (b.nickname || b.name || '').toLowerCase();
      for (const [key, synList] of Object.entries(NICKNAME_SYNONYMS)) {
        if (synList.includes(nick) && synList.some(s => lower.includes(s) || s.includes(lower))) {
          return true;
        }
      }
      return false;
    });
    if (synonymMatches.length === 1) return { status: 'matched', beneficiary: synonymMatches[0], cleanedName: clean };
    if (synonymMatches.length > 1) return { status: 'ambiguous', matches: synonymMatches, cleanedName: clean };

    // 3. Match on account holder name
    const exactHolder = beneficiaries.filter(b => {
      const holder = (b.accountHolderName || '').toLowerCase();
      return holder && (lower.includes(holder) || holder.includes(lower));
    });
    if (exactHolder.length === 1) return { status: 'matched', beneficiary: exactHolder[0], cleanedName: clean };
    if (exactHolder.length > 1) return { status: 'ambiguous', matches: exactHolder, cleanedName: clean };

    // 4. Token-based match on words length >= 3
    const words = lower.split(/\s+/).filter(w => w.length >= 3 && !['send', 'transfer', 'money', 'naira', 'please', 'give'].includes(w));
    for (const word of words) {
      const matches = beneficiaries.filter(b => {
        const nick = (b.nickname || '').toLowerCase();
        const holder = (b.accountHolderName || '').toLowerCase();
        if (nick.includes(word) || holder.includes(word)) return true;
        for (const [key, synList] of Object.entries(NICKNAME_SYNONYMS)) {
          if (synList.includes(nick) && synList.includes(word)) return true;
        }
        return false;
      });
      if (matches.length === 1) return { status: 'matched', beneficiary: matches[0], cleanedName: word };
      if (matches.length > 1) return { status: 'ambiguous', matches, cleanedName: word };
    }

    return { status: 'none', cleanedName: clean || rawText };
  }

  // Conversational Intent & Dialogue Manager
  async function handleCommand(raw) {
    const text = raw.toLowerCase().trim();
    setHistory(h => [...h, { who: 'you', text: raw }]);

    const say = (s, listen = true) => {
      setHistory(h => [...h, { who: 'app', text: s }]);
      speak(s, listen);
    };

    // Explicit sign out
    if (/\b(sign out|log out|exit app)\b/.test(text)) {
      logout();
      return;
    }

    // Global cancellation (English and Pidgin)
    if (/\b(cancel|stop|never mind|abort|go back|forget it|leave am|no send am|abeg stop|stop am|forget am|no do am)\b/.test(text)) {
      dialog.current = { step: 'idle', beneficiary: null, amount: null };
      say('Okay, I have cancelled that. What would you like to do next?');
      return;
    }

    // Natural conversation conclusion / ending phrases (English, Pidgin & Nigerian languages)
    const isExitPhrase = /\b(thank you|thanks|that's fine|thats fine|that is fine|that's all|thats all|that is all|i'm done|im done|i am done|all done|nothing else|nothing more|no thanks|no thank you|all good|we're done|we are done|bye|goodbye|have a good day|e don do|i don finish|na all|e dey okay|e choke|that one dey|nagode|daalu|mese|no wahala)\b/.test(text)
      || /^(ok|okay|alright|that's it|thats it|done)$/.test(text)
      || /\b(okay thank you|ok thanks|okay that's fine|ok that is fine|okay i'm done|ok im done|that's fine thank you)\b/.test(text);

    // If customer is idle and says an ending phrase:
    if (dialog.current.step === 'idle' && isExitPhrase) {
      if (recognition.current) {
        try { recognition.current.abort(); } catch {}
      }
      setListening(false);
      const firstName = customer?.name?.split(' ')[0] || '';
      const farewell = firstName
        ? `You're welcome, ${firstName}! Have a wonderful day. Tap to speak whenever you need me.`
        : "You're welcome! Have a wonderful day. Tap to speak whenever you need me.";
      say(farewell, false);
      return;
    }

    // If customer says an exit phrase while in the middle of picking beneficiary or amount
    if (dialog.current.step !== 'confirm' && dialog.current.step !== 'idle' && isExitPhrase) {
      dialog.current = { step: 'idle', beneficiary: null, amount: null };
      if (recognition.current) {
        try { recognition.current.abort(); } catch {}
      }
      setListening(false);
      say("Okay, we'll stop here. Have a great day! Tap the microphone whenever you're ready.", false);
      return;
    }

    // Step: Confirming transfer (English and Pidgin affirmative & negative)
    if (dialog.current.step === 'confirm') {
      if (/\b(yes|confirm|proceed|go ahead|do it|send it|sure|ok|okay|oya|oya send am|send am|abeg send am|do am|sharp sharp|na so|yes o|yes now|carry go)\b/.test(text)) {
        const { beneficiary, amount } = dialog.current;
        dialog.current = { step: 'idle', beneficiary: null, amount: null };
        try {
          const result = await api('/api/me/transfer', {
            method: 'POST',
            body: JSON.stringify({ beneficiaryId: beneficiary.id, amount })
          });
          setBalance(result.balance);
          setLatestReceipt({
            reference: result.reference,
            beneficiaryName: beneficiary.nickname || beneficiary.name,
            accountHolderName: beneficiary.accountHolderName,
            accountNumber: beneficiary.accountNumber,
            bankName: beneficiary.bankName,
            amount: result.formattedAmount,
            balance: result.formattedBalance,
            date: new Date().toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })
          });

          // Refresh transaction history
          fetch(API + '/api/me/transactions', { headers: { Authorization: 'Bearer ' + session } })
            .then(r => r.json())
            .then(t => setTransactions(Array.isArray(t) ? t : []))
            .catch(() => {});

          say(`${result.message} Your new demo balance is ${result.formattedBalance}. What else would you like to do?`);
        } catch (e) {
          say(e.message || 'Transfer failed. What would you like to do?');
        }
        return;
      }

      if (/\b(no|don't|do not|cancel|stop|leave am|no send am|abeg stop|stop am|forget am|no do am|make you leave am)\b/.test(text)) {
        dialog.current = { step: 'idle', beneficiary: null, amount: null };
        say('Transfer cancelled. What else would you like to do?');
        return;
      }

      say(`You are sending ${fmt(dialog.current.amount * 100)} to ${dialog.current.beneficiary.nickname || dialog.current.beneficiary.name}. Please say yes or oya to proceed, or no to cancel.`);
      return;
    }

    // Step: Specifying beneficiary for transfer
    if (dialog.current.step === 'beneficiary') {
      // If customer asks to hear/list beneficiaries, or speech recognition mishears "play fisheries"
      if (/\b(play fisheries|play fishery|fisheries|fishery|hear|list|tell|show|who|call|people|contacts|who dey)\b/i.test(text)) {
        const names = beneficiaries.map(b => b.nickname || b.name).join(', ');
        say(`Your saved beneficiaries are ${names}. Who would you like to send money to?`);
        return;
      }

      const match = resolveBeneficiary(text);
      if (match.status === 'matched') {
        const b = match.beneficiary;
        dialog.current = { step: 'amount', beneficiary: b };
        say(`Found ${b.nickname || b.name}. How much would you like to send?`);
        return;
      }
      if (match.status === 'ambiguous') {
        const names = match.matches.map(m => m.nickname || m.name).join(' or ');
        say(`I found multiple beneficiaries matching that: ${names}. Which one did you mean?`);
        return;
      }
      const targetName = match.cleanedName || raw;
      say(`I couldn't find a saved beneficiary for "${targetName}". Would you like to hear your saved beneficiaries or try another name?`);
      return;
    }

    // Step: Specifying amount for transfer
    if (dialog.current.step === 'amount') {
      const amount = parseAmount(text);
      if (!amount || amount <= 0) {
        say('Sorry, I did not catch the amount. Please say the amount in naira, for example, five thousand naira.');
        return;
      }

      const kobo = amount * 100;
      if (kobo > balance) {
        say(`You requested ${fmt(kobo)}, but your available balance is ${fmt(balance)}. Please specify a lower amount or say cancel.`);
        return;
      }

      dialog.current = { ...dialog.current, step: 'confirm', amount };
      const benName = dialog.current.beneficiary.nickname || dialog.current.beneficiary.name;
      say(`You are sending ${fmt(kobo)} to ${benName}. Should I proceed?`);
      return;
    }

    // Intent: Check balance (English & Pidgin)
    if (/\b(balance|how much|account balance|my money|check balance|how much dey|wetin dey|how much i get|wetin be my balance|how much remain|how much dey inside)\b/.test(text)) {
      say(`Your available account balance is ${fmt(balance)}. What else would you like to do?`);
      return;
    }

    // Intent: Beneficiaries enquiry (English, Pidgin & phonetic mishear "play fisheries")
    if (/\b(beneficiar|who can i send|contacts|who are my|saved recipients|play fisheries|play fishery|fisheries|fishery|who dey my list|who i fit send|call my people|people wey i save)\b/.test(text)) {
      if (!beneficiaries.length) {
        say('You have no saved beneficiaries registered on your account yet.');
        return;
      }
      const names = beneficiaries.map(b => b.nickname || b.name).join(', ');
      say(`Your saved beneficiaries are ${names}. Who would you like to send money to?`);
      return;
    }

    // Intent: Initiate transfer (English & Pidgin)
    if (/\b(transfer|send money|send|pay|i wan transfer|i wan send|help me send|make we send|send am|transfer am|pay money)\b/.test(text)) {
      const match = resolveBeneficiary(text);
      const amount = parseAmount(text);

      if (match.status === 'matched' && amount) {
        const kobo = amount * 100;
        if (kobo > balance) {
          say(`You requested to send ${fmt(kobo)} to ${match.beneficiary.nickname || match.beneficiary.name}, but your balance is ${fmt(balance)}. Would you like to send a different amount?`);
          dialog.current = { step: 'amount', beneficiary: match.beneficiary };
          return;
        }
        dialog.current = { step: 'confirm', beneficiary: match.beneficiary, amount };
        say(`You are sending ${fmt(kobo)} to ${match.beneficiary.nickname || match.beneficiary.name}. Should I proceed?`);
        return;
      }

      if (match.status === 'matched') {
        dialog.current = { step: 'amount', beneficiary: match.beneficiary };
        say(`Found ${match.beneficiary.nickname || match.beneficiary.name}. How much would you like to send?`);
        return;
      }

      if (match.status === 'ambiguous') {
        const names = match.matches.map(m => m.nickname || m.name).join(' or ');
        say(`You have multiple saved beneficiaries with that name: ${names}. Who would you like to send to?`);
        return;
      }

      dialog.current = { step: 'beneficiary' };
      say('Who would you like to transfer to?');
      return;
    }

    // Intent: Recent transactions
    if (/\b(transaction|recent|history|activity|statement)\b/.test(text)) {
      if (!transactions.length) {
        say('You have no recent transactions on this account.');
        return;
      }
      const summaryText = transactions.slice(0, 3)
        .map(t => `${t.type === 'debit' ? 'Debit' : 'Credit'} of ${t.formattedAmount} for ${t.description}`)
        .join('. ');
      say(`Here are your latest transactions: ${summaryText}. What else would you like to do?`);
      return;
    }

    // Intent: Help
    if (/\b(help|what can i do|options|commands|features)\b/.test(text)) {
      say('You can ask to check your account balance, send money to a saved beneficiary like Mama, list your beneficiaries, or hear recent transactions. What would you like to do?');
      return;
    }

    // Default: misunderstood
    say('I did not quite understand that. You can say check my balance, transfer to Mama, or show recent transactions.');
  }

  function manualSubmit(e) {
    e.preventDefault();
    const v = e.target.elements.request.value;
    e.target.reset();
    handleCommand(v);
  }

  const logout = () => {
    setSession('');
    setPhase('authenticate');
    setHistory([]);
    setLatestReceipt(null);
    speak('You have signed out. Please verify your identity using your device to continue.', false);
  };

  return (
    <div className={`customer-app ${highContrast ? 'high-contrast' : ''} text-size-${textSize}`}>
      {/* Screen reader live region */}
      <div
        role="status"
        aria-live="polite"
        style={{ position: 'absolute', width: 1, height: 1, margin: -1, padding: 0, overflow: 'hidden', clip: 'rect(0,0,0,0)', border: 0 }}
      >
        {message}
      </div>

      <header className="customer-header">
        <div className="logo">
          <div className="logo-mark">A</div>
          <div>
            <b>AccessAble</b>
            <small>Banking, made accessible.</small>
          </div>
        </div>
        <div className="header-actions">
          <span className="secure-label">
            <ShieldCheck size={14} /> Secure access
          </span>

          <button
            className="sound-btn"
            onClick={() => setHighContrast(!highContrast)}
            aria-label={highContrast ? 'Standard theme' : 'High contrast theme'}
            title="Toggle high contrast"
          >
            <Sun size={17} />
          </button>

          <button
            className="sound-btn"
            onClick={() => {
              const sizes = ['normal', 'large', 'extra-large'];
              const next = sizes[(sizes.indexOf(textSize) + 1) % sizes.length];
              setTextSize(next);
            }}
            aria-label="Cycle text size"
            title="Cycle text size"
          >
            <Type size={17} />
          </button>

          <button
            className="sound-btn"
            onClick={() => setVoice(!voice)}
            aria-label={voice ? 'Mute voice responses' : 'Enable voice responses'}
            title={voice ? 'Mute voice' : 'Enable voice'}
          >
            {voice ? <Volume2 size={17} /> : <VolumeX size={17} />}
          </button>
        </div>
      </header>

      <main className="customer-main">
        {phase === 'loading' ? (
          <div className="center-state">
            <LoaderCircle className="spin" size={24} />
            <p>Preparing your secure accessible access…</p>
          </div>
        ) : phase === 'error' ? (
          <section className="auth-card">
            <div className="hero-icon warning"><AlertCircle /></div>
            <span className="eyebrow">ACCESS NOTICE</span>
            <h1>We couldn't open your access</h1>
            <p>{message}</p>
            <button className="primary" onClick={() => location.reload()}>
              Retry
            </button>
          </section>
        ) : phase === 'home' ? (
          <section className="welcome-card">
            <div className="hero-icon"><MessageCircle /></div>
            <span className="eyebrow">YOUR BANKING, YOUR VOICE</span>
            <h1>Welcome to<br /><em>AccessAble.</em></h1>
            <p>Tap your bank-issued AccessAble NFC tag on this phone to open your personal banking experience.</p>
            <small className="muted-note">
              Demo mode: You can also open an activation link issued by staff in the dashboard console.
            </small>
          </section>
        ) : phase === 'enroll' ? (
          <section className="auth-card">
            <div className="hero-icon"><ShieldCheck /></div>
            <span className="eyebrow">ONE-TIME PASSKEY SETUP</span>
            <h1>Set up secure sign-in</h1>
            <p>{message}</p>
            <div className="info-box">
              Your device creates a cryptographic passkey. Your biometric or screen lock stays entirely on your phone. AccessAble never receives or transmits your biometric data.
            </div>
            <button className="primary large" disabled={busy} onClick={enroll}>
              {busy ? <LoaderCircle className="spin" /> : <ShieldCheck />}
              Register this phone with passkey
            </button>
            <button className="secondary large" disabled={busy} onClick={fallbackAuth}>
              Continue with device verification
            </button>
            <small className="muted-note">This is a demonstration environment with simulated balances.</small>
          </section>
        ) : phase === 'authenticate' ? (
          <section className="auth-card">
            <div className="hero-icon"><LockKeyhole /></div>
            <span className="eyebrow">SECURE CUSTOMER ACCESS</span>
            <h1>Verify your identity</h1>
            <p>{message}</p>
            <button className="primary large" disabled={busy} onClick={authenticate}>
              {busy ? <LoaderCircle className="spin" /> : <ShieldCheck />}
              Verify with this device
            </button>
            <button className="secondary large" disabled={busy} onClick={fallbackAuth}>
              Device authentication fallback
            </button>
            <small className="muted-note">Protected by platform passkey verification.</small>
          </section>
        ) : (
          <section className="voice-layout">
            <div className="voice-topline">
              <div>
                <span className="eyebrow">PERSONAL BANKING ASSISTANT</span>
                <h1>Hello, {customer?.name?.split(' ')[0]}.</h1>
                <p>Your accessible banking is ready. Speak or tap below.</p>
              </div>
              <button className="logout" onClick={logout}>
                <LogOut size={15} /> Sign out
              </button>
            </div>

            <div className="assistant-card">
              <div className={`voice-orb ${listening ? 'listening' : ''}`}>
                <div className="orb-core">
                  <Volume2 size={31} />
                </div>
              </div>
              <span className="listening-state">{listening ? 'LISTENING' : 'ACCESSABLE ASSISTANT'}</span>
              <h2>{message}</h2>
              <p className="hint">
                {listening ? 'Speak naturally. I am listening…' : 'Tap the microphone or say a request at any time.'}
              </p>
              <button
                className={`mic-button ${listening ? 'active' : ''}`}
                onClick={startListening}
                aria-label={listening ? 'Listening to speech' : 'Start speaking'}
              >
                {listening ? <MicOff /> : <Mic />}
                <span>{listening ? 'Listening…' : 'Tap to speak'}</span>
              </button>
            </div>

            {/* Accessible receipt card when a transfer completes */}
            {latestReceipt && (
              <div className="receipt-card" role="region" aria-label="Transaction receipt">
                <div className="receipt-title">
                  <CheckCircle2 size={18} style={{ color: '#16a34a' }} />
                  <span>Transfer Receipt</span>
                </div>
                <div className="receipt-row">
                  <span>Reference</span>
                  <strong style={{ fontFamily: 'monospace' }}>{latestReceipt.reference}</strong>
                </div>
                <div className="receipt-row">
                  <span>Recipient</span>
                  <strong>{latestReceipt.beneficiaryName} ({latestReceipt.bankName})</strong>
                </div>
                <div className="receipt-row">
                  <span>Account number</span>
                  <strong style={{ fontFamily: 'monospace' }}>{latestReceipt.accountNumber}</strong>
                </div>
                <div className="receipt-row">
                  <span>Amount sent</span>
                  <strong style={{ color: '#dc2626' }}>{latestReceipt.amount}</strong>
                </div>
                <div className="receipt-row">
                  <span>Remaining balance</span>
                  <strong style={{ color: '#16a34a' }}>{latestReceipt.balance}</strong>
                </div>
                <div className="receipt-row">
                  <span>Time</span>
                  <span>{latestReceipt.date}</span>
                </div>
              </div>
            )}

            <div className="quick-actions">
              <button onClick={() => handleCommand('Check my account balance')} aria-label="Check account balance">
                <Wallet />
                <span>Check balance</span>
              </button>
              <button onClick={() => handleCommand('I want to transfer money')} aria-label="Make a transfer">
                <ArrowLeftRight />
                <span>Make a transfer</span>
              </button>
              <button onClick={() => handleCommand('Who are my beneficiaries')} aria-label="List saved beneficiaries">
                <Users />
                <span>Beneficiaries</span>
              </button>
              <button onClick={() => handleCommand('Show recent transactions')} aria-label="Recent activity">
                <History />
                <span>Recent activity</span>
              </button>
            </div>

            {history.length > 0 && (
              <div className="conversation" role="log" aria-label="Conversation log">
                <div className="conversation-title">Conversation</div>
                {history.slice(-6).map((h, i) => (
                  <div className={'bubble ' + h.who} key={i}>
                    <small>{h.who === 'you' ? 'YOU' : 'ACCESSABLE'}</small>
                    {h.text}
                  </div>
                ))}
              </div>
            )}

            <form className="manual-input" onSubmit={manualSubmit}>
              <label htmlFor="request">Type a command (fallback or screen-reader input):</label>
              <div>
                <input
                  id="request"
                  name="request"
                  placeholder="e.g. Transfer 5000 to Mama, or Check balance"
                  required
                />
                <button className="primary" type="submit" aria-label="Submit command">
                  <Send size={15} />
                </button>
              </div>
            </form>

            <div className="privacy-note">
              <ShieldCheck size={15} />
              <span>Simulated demo banking · No connection to live financial rails</span>
            </div>
          </section>
        )}
      </main>

      <footer className="customer-footer">
        ACCESSABLE BANKING <span>Accessible by design</span>
      </footer>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
