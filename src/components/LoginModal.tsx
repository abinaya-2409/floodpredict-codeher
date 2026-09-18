import React, { useState } from 'react';
import { ArrowRight, Building2, CheckCircle2, Lock, Mail, MapPin, X } from 'lucide-react';
import { CityData, ZoneData } from '../types';

export interface AuthSession { mode: 'citizen' | 'authority'; isGuest: boolean; contact?: string; roleId?: string; roleLabel?: string; wardId: string; wardName: string; zoneName: string; }
interface Props { selectedCity: CityData; zones: ZoneData[]; onLoginSuccess: (session: AuthSession) => void; onSignOut?: () => void; onClose?: () => void; initialSession?: AuthSession | null; }
const ROLES = [{ id: 'gcc_zone', label: 'GCC Zone Officer' }, { id: 'disaster_mgmt', label: 'State Disaster Management' }, { id: 'drainage_dept', label: 'Stormwater Drainage' }, { id: 'emergency_rescue', label: 'Fire & Rescue Operations' }];

export const LoginModal: React.FC<Props> = ({ selectedCity, zones, onLoginSuccess, onSignOut, onClose, initialSession }) => {
  const [mode, setMode] = useState<'citizen' | 'authority'>('citizen');
  const [wardId, setWardId] = useState(zones[0]?.id || '');
  const [contact, setContact] = useState('');
  const [role, setRole] = useState(ROLES[0].id);
  const [notice, setNotice] = useState('');
  const [otp, setOtp] = useState('');
  const [otpToken, setOtpToken] = useState<string | null>(null);
  const [verificationSent, setVerificationSent] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const ward = zones.find((zone) => zone.id === wardId) || zones[0];
  const start = (isGuest: boolean) => onLoginSuccess({ mode, isGuest, contact: isGuest ? 'Guest user' : (contact.trim() || 'officer@gcc.gov.in'), roleId: mode === 'authority' ? role : undefined, roleLabel: ROLES.find((item) => item.id === role)?.label, wardId: ward.id, wardName: ward.name, zoneName: `${selectedCity.name} - ${ward.name}` });
  const requestVerification = async () => {
    if (!contact.trim()) { setNotice('Enter an email address to continue.'); return; }
    setIsSubmitting(true); setNotice('');
    try {
      const response = await fetch('/api/auth/send-otp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contact: contact.trim(), wardName: ward.name, wardId: ward.id }) });
      const data = await response.json();
      if (!response.ok || !data.success) { setNotice(data.message || 'Unable to send a verification code.'); return; }
      setOtpToken(data.otpToken || null); setVerificationSent(true); setNotice(data.message || 'A verification code has been sent.');
    } catch { setNotice('Unable to reach the verification service. Please try again.'); }
    finally { setIsSubmitting(false); }
  };
  const verifyOtp = async () => {
    if (otp.trim().length !== 4) { setNotice('Enter the 4-digit verification code.'); return; }
    setIsSubmitting(true); setNotice('');
    try {
      const response = await fetch('/api/auth/verify-otp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contact: contact.trim(), otp: otp.trim(), otpToken: otpToken || undefined }) });
      const data = await response.json();
      if (!response.ok || !data.success) { setNotice(data.message || 'That verification code was not accepted.'); return; }
      start(false);
    } catch { setNotice('Unable to verify the code. Please try again.'); }
    finally { setIsSubmitting(false); }
  };
  return <div className="auth-overlay" role="dialog" aria-modal="true" aria-label="Sign in to FloodyPredict"><div className="auth-panel">
    <button onClick={onClose} className="auth-close" aria-label="Close sign in"><X size={18} /></button>
    <div className="auth-brand"><div><strong>FloodyPredict</strong><p>Flood intelligence platform</p></div></div>
    {initialSession && !initialSession.isGuest && <div className="signed-in"><CheckCircle2 size={16} /> Signed in as {initialSession.contact}<button onClick={onSignOut}>Sign out</button></div>}
    <div className="auth-heading"><h1>Access your flood information</h1><p>Choose an area to receive relevant alerts, forecasts, and operational guidance.</p></div>
    <div className="auth-tabs"><button onClick={() => setMode('citizen')} className={mode === 'citizen' ? 'is-active' : ''}>Resident</button><button onClick={() => setMode('authority')} className={mode === 'authority' ? 'is-active' : ''}>Authority</button></div>
    <label className="auth-label"><span><MapPin size={15} /> Alert area</span><select value={wardId} onChange={(e) => setWardId(e.target.value)}>{zones.map((zone) => <option key={zone.id} value={zone.id}>{zone.name} - Ward {zone.wardNumbers?.join(', ') || zone.id}</option>)}</select></label>
    {mode === 'citizen' ? <><section className="auth-choice"><h2>Browse without an account</h2><p>View the live risk map and local emergency resources now.</p><button className="button button--primary button--full" onClick={() => start(true)}>Continue as guest <ArrowRight size={16} /></button></section><div className="auth-divider"><span>or receive personalised alerts</span></div><label className="auth-label"><span><Mail size={15} /> Email address</span><input value={contact} onChange={(e) => setContact(e.target.value)} type="email" placeholder="name@example.com" /></label>{verificationSent && <label className="auth-label"><span><Lock size={15} /> Verification code</span><input value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 4))} inputMode="numeric" placeholder="4-digit code" /></label>}<button className="button button--secondary button--full" disabled={isSubmitting} onClick={verificationSent ? verifyOtp : requestVerification}>{isSubmitting ? 'Please wait...' : verificationSent ? 'Verify and continue' : 'Send verification code'}</button></> : <form onSubmit={(event) => { event.preventDefault(); start(false); }} className="auth-form"><label className="auth-label"><span><Building2 size={15} /> Role</span><select value={role} onChange={(e) => setRole(e.target.value)}>{ROLES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label><label className="auth-label"><span><Mail size={15} /> Official email</span><input value={contact} onChange={(e) => setContact(e.target.value)} type="email" placeholder="name@agency.gov.in" required /></label><label className="auth-label"><span><Lock size={15} /> Password</span><input type="password" placeholder="Enter password" required /></label><button className="button button--primary button--full" type="submit">Sign in to command view <ArrowRight size={16} /></button></form>}
    {notice && <p className="auth-notice">{notice}</p>}<p className="auth-footer">For an immediate emergency, call your local disaster control room.</p>
  </div></div>;
};
