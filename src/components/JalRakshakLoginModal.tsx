import React, { useState, useEffect } from 'react';
import { CityData, ZoneData } from '../types';
import { Shield, ShieldAlert, UserCheck, ArrowRight, Lock, Phone, Mail, MapPin, Building2, CheckCircle2, RefreshCw, Loader2, AlertCircle, Sparkles } from 'lucide-react';

export interface AuthSession {
  mode: 'citizen' | 'authority';
  isGuest: boolean;
  contact?: string;
  roleId?: string;
  roleLabel?: string;
  wardId: string;
  wardName: string;
  zoneName: string;
}

interface Props {
  selectedCity: CityData;
  zones: ZoneData[];
  onLoginSuccess: (session: AuthSession) => void;
  initialSession?: AuthSession | null;
}

const AUTHORITY_ROLES = [
  { id: 'gcc_zone', label: 'GCC Zone Officer (Zonal Command)', department: 'Greater Chennai Corporation' },
  { id: 'disaster_mgmt', label: 'State Disaster Management (TNSDMA)', department: 'Govt of Tamil Nadu' },
  { id: 'drainage_dept', label: 'Stormwater Drainage & Canal Works', department: 'GCC Public Works' },
  { id: 'metro_water', label: 'CMWSSB (Chennai Metro Water)', department: 'Water Supply & Sewerage Board' },
  { id: 'emergency_rescue', label: 'TNFRS & SDRF Flood Rescue Unit', department: 'Fire & Rescue Operations' },
  { id: 'imd_met', label: 'Regional Meteorological Centre (IMD)', department: 'Hydrological Forecasting' }
];

export const JalRakshakLoginModal: React.FC<Props> = ({
  selectedCity,
  zones,
  onLoginSuccess,
  initialSession
}) => {
  const [mode, setMode] = useState<'citizen' | 'authority'>('citizen');
  
  // Default selected ward to first zone or Velachery if available
  const defaultZone = zones.find(z => z.id.toLowerCase().includes('velachery')) || zones[0];
  const [selectedWardId, setSelectedWardId] = useState<string>(defaultZone?.id || '');

  // Citizen Sign-in states
  const [contactInput, setContactInput] = useState('');
  const [isOtpSent, setIsOtpSent] = useState(false);
  const [otpDigits, setOtpDigits] = useState(['', '', '', '']);
  const [otpCountdown, setOtpCountdown] = useState(30);
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [otpStatusMsg, setOtpStatusMsg] = useState<string | null>(null);
  const [devOtpHint, setDevOtpHint] = useState<string | null>(null);
  const [otpToken, setOtpToken] = useState<string | null>(null);
  const [emailDelivered, setEmailDelivered] = useState(false);
  const [etherealPreviewUrl, setEtherealPreviewUrl] = useState<string | null>(null);
  const [isEthereal, setIsEthereal] = useState(false);


  // Authority states
  const [authorityRole, setAuthorityRole] = useState(AUTHORITY_ROLES[0].id);
  const [authorityIdentifier, setAuthorityIdentifier] = useState('officer.zone13@gcc.gov.in');
  const [authorityPassword, setAuthorityPassword] = useState('chennai2026');

  // Status toast
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 4000);
  };

  useEffect(() => {
    let timer: any;
    if (isOtpSent && otpCountdown > 0) {
      timer = setInterval(() => setOtpCountdown(c => c - 1), 1000);
    }
    return () => clearInterval(timer);
  }, [isOtpSent, otpCountdown]);

  const getWardObj = (id: string) => {
    const found = zones.find(z => z.id === id) || zones[0];
    return {
      wardId: found.id,
      wardName: found.name,
      zoneName: `${selectedCity.name} - ${found.name}`
    };
  };

  // Flow 1: Guest Login (Skip login)
  const handleContinueAsGuest = () => {
    const ward = getWardObj(selectedWardId);
    const session: AuthSession = {
      mode: 'citizen',
      isGuest: true,
      contact: 'Guest Citizen',
      wardId: ward.wardId,
      wardName: ward.wardName,
      zoneName: ward.zoneName
    };
    onLoginSuccess(session);
  };

  // Flow 2: Citizen Send OTP via Backend API
  const handleSendOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const contact = contactInput.trim();
    if (!contact) {
      showToast('Please enter your email address.');
      return;
    }

    setIsSendingOtp(true);
    setOtpError(null);
    setDevOtpHint(null);
    setOtpToken(null);
    setEtherealPreviewUrl(null);
    setIsEthereal(false);

    const ward = getWardObj(selectedWardId);

    try {
      const res = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contact,
          wardName: ward.wardName,
          wardId: ward.wardId,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        showToast(data.message || 'Unable to send OTP. Please try again.');
        setOtpError(data.message || 'Failed to dispatch verification code.');
        setIsSendingOtp(false);
        return;
      }

      setIsOtpSent(true);
      setOtpCountdown(30);
      setEmailDelivered(Boolean(data.delivered));
      setOtpStatusMsg(data.message);
      if (data.otpToken) setOtpToken(data.otpToken);
      if (data.devOtp) setDevOtpHint(data.devOtp);
      if (data.previewUrl) setEtherealPreviewUrl(data.previewUrl);
      if (data.ethereal) setIsEthereal(true);
      setOtpDigits(['', '', '', '']);
      showToast(data.delivered ? `✅ OTP sent to ${contact}!` : `🔑 OTP ready for ${contact}`);
    } catch (err: any) {
      console.error('[JalRakshak] OTP request error:', err);
      showToast('Network error while requesting OTP.');
      setOtpError('Failed to connect to authentication server.');
    } finally {
      setIsSendingOtp(false);
    }
  };


  const handleOtpChange = (index: number, val: string) => {
    setOtpError(null);
    const cleaned = val.slice(-1);
    const updated = [...otpDigits];
    updated[index] = cleaned;
    setOtpDigits(updated);

    if (cleaned && index < 3) {
      const nextInput = document.getElementById(`otp-box-${index + 1}`);
      nextInput?.focus();
    }
  };

  // Flow 3: Verify OTP via Backend API
  const handleVerifyOtp = async () => {
    const entered = otpDigits.join('').trim();
    if (entered.length < 4) {
      setOtpError('Please enter all 4 digits of your verification code.');
      return;
    }

    setIsVerifyingOtp(true);
    setOtpError(null);

    try {
      const res = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contact: contactInput.trim(),
          otp: entered,
          otpToken: otpToken || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setOtpError(data.message || 'Invalid or expired OTP code.');
        setIsVerifyingOtp(false);
        return;
      }

      showToast('Verification successful! Welcome to JalRakshak AI.');
      const ward = getWardObj(selectedWardId);
      const session: AuthSession = {
        mode: 'citizen',
        isGuest: false,
        contact: contactInput.trim(),
        wardId: ward.wardId,
        wardName: ward.wardName,
        zoneName: ward.zoneName,
      };
      onLoginSuccess(session);
    } catch (err: any) {
      console.error('[JalRakshak] OTP verification error:', err);
      setOtpError('Network connection error during verification.');
    } finally {
      setIsVerifyingOtp(false);
    }
  };

  // Flow 4: Authority Login
  const handleAuthorityLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const ward = getWardObj(selectedWardId);
    const roleObj = AUTHORITY_ROLES.find(r => r.id === authorityRole) || AUTHORITY_ROLES[0];
    const session: AuthSession = {
      mode: 'authority',
      isGuest: false,
      roleId: roleObj.id,
      roleLabel: roleObj.label,
      contact: authorityIdentifier.trim() || 'officer@chennaicorporation.gov.in',
      wardId: ward.wardId,
      wardName: ward.wardName,
      };
    onLoginSuccess(session);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md overflow-y-auto">
      
      {/* Toast */}
      {toastMsg && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[110] px-4 py-2.5 rounded-full bg-emerald-500/90 border border-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-2 shadow-2xl animate-bounce">
          <CheckCircle2 className="w-4 h-4" />
          <span>{toastMsg}</span>
        </div>
      )}

      <div className="relative w-full max-w-lg my-auto rounded-3xl bg-slate-900/90 border border-cyan-500/30 shadow-[0_25px_60px_-15px_rgba(0,173,181,0.25)] p-6 sm:p-8 backdrop-blur-2xl">
        
        {/* Top Emblem & Brand */}
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-teal-500 via-cyan-600 to-blue-600 p-0.5 shadow-[0_0_24px_rgba(20,184,166,0.4)] flex items-center justify-center mb-3">
            <div className="w-full h-full rounded-[14px] bg-slate-950/40 flex items-center justify-center text-white">
              <Shield className="w-7 h-7 text-cyan-300" />
            </div>
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            JalRakshak AI
          </h2>
          <p className="text-xs text-cyan-400 font-mono tracking-wider mt-1 uppercase">
            {selectedCity.name} Flood Alert &amp; Inundation Defense System
          </p>
        </div>

        {/* Mode Toggle */}
        <div className="grid grid-cols-2 p-1 mb-6 rounded-2xl bg-slate-950/80 border border-slate-800 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setMode('citizen')}
            className={`py-2.5 px-3 rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer ${
              mode === 'citizen'
                ? 'bg-gradient-to-r from-teal-600 to-cyan-600 text-white shadow-lg border border-teal-400/40 font-bold'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <UserCheck className="w-4 h-4" />
            <span>Citizen Mode</span>
          </button>
          
          <button
            type="button"
            onClick={() => setMode('authority')}
            className={`py-2.5 px-3 rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer ${
              mode === 'authority'
                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg border border-blue-400/40 font-bold'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <ShieldAlert className="w-4 h-4" />
            <span>Authority (Admin)</span>
          </button>
        </div>

        {/* Ward Selector Common to Modes */}
        <div className="mb-5">
          <label className="block text-[11px] font-mono text-slate-300 uppercase tracking-wider mb-1.5 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-cyan-400" />
              Default Alert Ward ({selectedCity.name})
            </span>
            <span className="text-cyan-400 text-[10px] font-sans font-normal">GCC Wards</span>
          </label>
          <select
            value={selectedWardId}
            onChange={(e) => setSelectedWardId(e.target.value)}
            className="w-full h-11 px-3.5 rounded-xl bg-slate-950 border border-cyan-500/20 text-slate-100 text-xs font-medium focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 transition-all cursor-pointer"
          >
            {zones.map((zone) => (
              <option key={zone.id} value={zone.id} className="bg-slate-900 text-white">
                {zone.name} (Ward {zone.wardNumbers ? zone.wardNumbers.join(', ') : zone.id}) - {zone.currentRisk.toUpperCase()} Risk
              </option>
            ))}
          </select>
        </div>

        {/* MODE 1: CITIZEN */}
        {mode === 'citizen' && (
          <div className="space-y-4">
            
            {/* Prominent "Continue as Guest" Card */}
            <div className="p-4 rounded-2xl bg-gradient-to-br from-teal-950/40 to-cyan-950/30 border border-teal-500/30 relative overflow-hidden">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-teal-400 animate-ping" />
                  Instant Risk Map Access
                </span>
                <span className="px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-300 text-[10px] font-mono font-semibold border border-teal-400/30">
                  NO SIGN IN NEEDED
                </span>
              </div>
              <p className="text-[11px] text-slate-300 mb-3">
                Skip login and proceed directly to live flood radars, water depths, and nearest relief shelters for your ward.
              </p>
              <button
                type="button"
                onClick={handleContinueAsGuest}
                className="w-full h-11 rounded-xl bg-gradient-to-r from-teal-500 via-cyan-500 to-blue-600 hover:brightness-110 text-white font-bold text-xs tracking-wide flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(20,184,166,0.3)] transition-all cursor-pointer"
              >
                <span>Continue as Guest</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>

            <div className="relative flex items-center justify-center my-4">
              <div className="border-t border-slate-800 w-full" />
              <span className="bg-slate-900 px-3 text-[10px] font-mono text-slate-500 uppercase tracking-widest absolute">
                Or Sign In for SMS Alerts
              </span>
            </div>

            {/* Sign in with Phone / OTP */}
            <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-200">Personalized Citizen Alerts</span>
                <span className="text-[10px] text-teal-400 font-mono">Automated WhatsApp &amp; SMS</span>
              </div>

              {!isOtpSent ? (
                <form onSubmit={handleSendOtp} className="space-y-3">
                  <div>
                    <label className="block text-[10px] font-mono text-slate-400 mb-1">
                      Mobile Number or Email
                    </label>
                    <div className="relative flex items-center">
                      <Phone className="w-4 h-4 text-slate-500 absolute left-3.5 pointer-events-none" />
                      <input
                        type="text"
                        value={contactInput}
                        onChange={(e) => {
                          setContactInput(e.target.value);
                          setOtpError(null);
                        }}
                        placeholder="e.g. bhavanasri522@gmail.com or +91 98400 12345"
                        className="w-full h-10 pl-10 pr-3 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs placeholder:text-slate-500 focus:outline-none focus:border-cyan-400 transition-all"
                      />
                    </div>
                  </div>

                  {otpError && (
                    <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-[11px] flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                      <span>{otpError}</span>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isSendingOtp}
                    className="w-full h-10 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 hover:text-white text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSendingOtp ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
                        <span>Connecting to Gateway &amp; Sending OTP...</span>
                      </>
                    ) : (
                      <>
                        <span>Send Verification Code (OTP)</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </>
                    )}
                  </button>
                </form>
              ) : (
                /* Backend OTP flow */
                <div className="space-y-3 pt-1">
                  {/* Delivery Status Banner */}
                  {emailDelivered ? (
                    <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-[11px] flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
                      <div className="leading-snug">
                        <span>Official OTP email dispatched to <strong>{contactInput}</strong>! Check your inbox and spam folder.</span>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-[11px] space-y-0 overflow-hidden">
                      <div className="flex items-center gap-2 px-3 py-2.5">
                        <Sparkles className="w-4 h-4 shrink-0 text-cyan-400" />
                        <span>OTP dispatched for <strong>{contactInput}</strong></span>
                      </div>

                      {/* Ethereal email preview link */}
                      {isEthereal && etherealPreviewUrl && (
                        <div className="px-3 pb-2.5 pt-0.5 border-t border-cyan-500/20 space-y-1.5">
                          <p className="text-[10px] text-slate-400 leading-snug">
                            📧 Email captured by <strong className="text-cyan-300">Ethereal</strong> test server. Open the link below to see the formatted OTP email:
                          </p>
                          <a
                            href={etherealPreviewUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 text-[11px] text-cyan-400 hover:text-cyan-300 underline underline-offset-2 break-all transition-colors"
                          >
                            <span>👁 View OTP Email Preview</span>
                            <ArrowRight className="w-3 h-3 shrink-0" />
                          </a>
                        </div>
                      )}

                      {/* Auto-fill code bar */}
                      {devOtpHint && (
                        <div className="flex items-center justify-between px-3 py-2 border-t border-cyan-500/20 bg-slate-900/40">
                          <span className="font-mono text-xs text-white">Your Code: <strong className="text-cyan-300 tracking-widest text-base">{devOtpHint}</strong></span>
                          <button
                            type="button"
                            onClick={() => {
                              const digits = devOtpHint.split('');
                              setOtpDigits(digits);
                              setOtpError(null);
                            }}
                            className="text-[10px] bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 px-2.5 py-1 rounded-md transition-all cursor-pointer font-semibold"
                          >
                            Auto-Fill ↓
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {otpError && (
                    <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-[11px] flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                      <span>{otpError}</span>
                    </div>
                  )}

                  <div>
                    <label className="block text-[10px] font-mono text-slate-400 mb-1.5 text-center">
                      Enter 4-Digit Verification Code
                    </label>
                    <div className="flex justify-center gap-2.5">
                      {[0, 1, 2, 3].map((idx) => (
                        <input
                          key={idx}
                          id={`otp-box-${idx}`}
                          type="text"
                          maxLength={1}
                          value={otpDigits[idx]}
                          onChange={(e) => handleOtpChange(idx, e.target.value)}
                          className={`w-12 h-12 text-center text-lg font-bold text-white bg-slate-900 border rounded-xl focus:outline-none transition-all ${
                            otpError ? 'border-rose-500/80 focus:border-rose-400' : 'border-cyan-500/40 focus:border-cyan-400'
                          }`}
                        />
                      ))}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleVerifyOtp}
                    disabled={isVerifyingOtp}
                    className="w-full h-10 rounded-xl bg-gradient-to-r from-teal-500 to-cyan-500 hover:brightness-110 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-lg transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isVerifyingOtp ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-white" />
                        <span>Verifying Code...</span>
                      </>
                    ) : (
                      <>
                        <span>Verify &amp; Enter Portal</span>
                        <CheckCircle2 className="w-4 h-4" />
                      </>
                    )}
                  </button>

                  <div className="flex items-center justify-between text-[11px] px-1 text-slate-500">
                    <button
                      type="button"
                      onClick={() => {
                        setIsOtpSent(false);
                        setOtpError(null);
                        setOtpDigits(['', '', '', '']);
                      }}
                      className="text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                    >
                      Change email/phone
                    </button>

                    {otpCountdown > 0 ? (
                      <span>Resend in <strong className="text-cyan-400">{otpCountdown}s</strong></span>
                    ) : (
                      <button
                        type="button"
                        disabled={isSendingOtp}
                        onClick={() => handleSendOtp()}
                        className="text-cyan-400 hover:underline cursor-pointer disabled:opacity-50"
                      >
                        {isSendingOtp ? 'Sending...' : 'Resend OTP Code'}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

          </div>
        )}

        {/* MODE 2: AUTHORITY (ADMIN) */}
        {mode === 'authority' && (
          <form onSubmit={handleAuthorityLogin} className="space-y-4">
            <div className="p-3 rounded-2xl bg-blue-950/40 border border-blue-500/30 text-blue-300 text-[11px] flex items-center gap-2.5">
              <ShieldAlert className="w-5 h-5 shrink-0 text-blue-400" />
              <span>Official Greater Chennai Corporation (GCC) &amp; TNSDMA Emergency Command Access.</span>
            </div>

            <div>
              <label className="block text-[11px] font-mono text-slate-300 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-blue-400" />
                Command Role (At Signup / Login)
              </label>
              <select
                value={authorityRole}
                onChange={(e) => setAuthorityRole(e.target.value)}
                className="w-full h-11 px-3.5 rounded-xl bg-slate-950 border border-blue-500/20 text-slate-100 text-xs font-medium focus:outline-none focus:border-blue-400 transition-all cursor-pointer"
              >
                {AUTHORITY_ROLES.map((role) => (
                  <option key={role.id} value={role.id} className="bg-slate-900 text-white">
                    {role.label} ({role.department})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-mono text-slate-300 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-blue-400" />
                Official Gov ID or Email
              </label>
              <input
                type="text"
                value={authorityIdentifier}
                onChange={(e) => setAuthorityIdentifier(e.target.value)}
                placeholder="zone13.officer@gcc.gov.in"
                className="w-full h-10 px-3.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-blue-400 transition-all"
                required
              />
            </div>

            <div>
              <label className="block text-[11px] font-mono text-slate-300 uppercase tracking-wider mb-1 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-blue-400" />
                  Security PIN / Password
                </span>
                <span className="text-slate-500 text-[10px] font-sans font-normal">Any input logs in</span>
              </label>
              <input
                type="password"
                value={authorityPassword}
                onChange={(e) => setAuthorityPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full h-10 px-3.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-blue-400 transition-all"
                required
              />
            </div>

            <button
              type="submit"
              className="w-full h-11 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-600 hover:brightness-110 text-white font-bold text-xs tracking-wide flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(59,130,246,0.3)] transition-all cursor-pointer"
            >
              <ShieldAlert className="w-4 h-4" />
              <span>Authenticate Authority Session</span>
            </button>
          </form>
        )}

        {/* GCC & TNSDMA Trust Footer */}
        <div className="mt-6 pt-4 border-t border-slate-800 flex items-center justify-between text-[10px] text-slate-500">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span>Govt of Tamil Nadu • GCC Node</span>
          </div>
          <span>JalRakshak AI v2.4</span>
        </div>

      </div>
    </div>
  );
};
