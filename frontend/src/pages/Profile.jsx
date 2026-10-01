import { useState } from 'react';
import { FcGoogle } from 'react-icons/fc';
import { FiBell, FiKey, FiMapPin, FiSave, FiUser } from 'react-icons/fi';
import { toast } from 'react-toastify';
import LocationPicker from '../components/map/LocationPicker';
import { Avatar, Badge, Field, PageHeader, Spinner, Toggle } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { dateOnly, ROLE_LABEL } from '../lib/format';
import PasswordInput from './auth/PasswordInput';

function Card({ icon: Icon, title, subtitle, children }) {
  return (
    <section className="card p-5 sm:p-6">
      <div className="mb-5 flex items-start gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-400/10 text-brand-300">
          <Icon />
        </span>
        <div>
          <h2 className="text-lg">{title}</h2>
          {subtitle && <p className="text-sm text-ink-400">{subtitle}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

function PasswordCard({ user, onSaved }) {
  const hasPassword = user.authProviders.includes('password');
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const d = await api('/auth/me/password', { method: 'POST', body: { currentPassword: current, newPassword: next } });
      onSaved(d.user);
      setCurrent('');
      setNext('');
      toast.success(hasPassword ? 'Password updated.' : 'Password added — you can now also sign in with email.');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card
      icon={FiKey}
      title={hasPassword ? 'Change password' : 'Add a password'}
      subtitle={hasPassword ? undefined : 'You signed up with Google. Add a password to also sign in with your email.'}
    >
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        {hasPassword && (
          <Field label="Current password">
            {(id) => <PasswordInput id={id} value={current} onChange={setCurrent} autoComplete="current-password" />}
          </Field>
        )}
        <Field label="New password">
          {(id) => <PasswordInput id={id} value={next} onChange={setNext} autoComplete="new-password" showStrength />}
        </Field>
        <div className="sm:col-span-2">
          <button type="submit" className="btn btn-secondary" disabled={busy || next.length < 8}>
            {busy ? <Spinner className="h-4 w-4" /> : hasPassword ? 'Update password' : 'Add password'}
          </button>
        </div>
      </form>
    </Card>
  );
}

export default function Profile() {
  const { user, setUser } = useAuth();
  const [form, setForm] = useState({
    name: user.name,
    phone: user.phone || '',
    organization: user.organization || '',
    address: user.address || '',
    location: user.location,
    notifyRadiusKm: user.notifyRadiusKm ?? 5,
    emailNotifications: user.emailNotifications ?? true,
  });
  const [saving, setSaving] = useState(false);
  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value?.target ? value.target.value : value }));
  const isOrg = ['restaurant', 'ngo'].includes(user.role);

  const save = async (e) => {
    e?.preventDefault();
    setSaving(true);
    try {
      const body = {
        name: form.name.trim(),
        phone: form.phone.trim(),
        address: form.address.trim(),
        notifyRadiusKm: form.notifyRadiusKm,
        emailNotifications: form.emailNotifications,
        ...(isOrg ? { organization: form.organization.trim() } : {}),
        ...(form.location ? { lat: form.location.lat, lng: form.location.lng } : {}),
      };
      const d = await api('/auth/me', { method: 'PATCH', body });
      setUser(d.user);
      toast.success('Profile saved.');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="container-page max-w-4xl py-10">
      <PageHeader eyebrow="Account" title="Profile & settings" />

      <div className="card mb-6 flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
        <Avatar name={user.name} src={user.avatar} size="h-16 w-16" className="text-lg" />
        <div className="flex-1">
          <p className="text-xl font-bold text-white">{user.organization || user.name}</p>
          <p className="text-sm text-ink-400">{user.email}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge tone="emerald">{ROLE_LABEL[user.role]}</Badge>
            {user.authProviders.includes('google') && (
              <Badge tone="slate">
                <FcGoogle /> Google linked
              </Badge>
            )}
            <Badge tone="slate">Member since {dateOnly(user.createdAt)}</Badge>
          </div>
        </div>
      </div>

      <form onSubmit={save} className="space-y-6">
        <Card icon={FiUser} title={isOrg ? 'Organization' : 'Personal details'}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Your name">
              {(id) => <input id={id} className="input" value={form.name} onChange={set('name')} required />}
            </Field>
            <Field label="Phone" hint={isOrg ? 'Shown only to people with a confirmed reservation.' : undefined}>
              {(id) => <input id={id} className="input" value={form.phone} onChange={set('phone')} placeholder="+91 98xxx xxxxx" />}
            </Field>
            {isOrg && (
              <Field label={user.role === 'ngo' ? 'NGO name' : 'Restaurant / business name'} className="sm:col-span-2">
                {(id) => <input id={id} className="input" value={form.organization} onChange={set('organization')} />}
              </Field>
            )}
          </div>
        </Card>

        <Card
          icon={FiMapPin}
          title="Location"
          subtitle={
            user.role === 'ngo'
              ? 'Used to alert you when food is listed within your radius.'
              : user.role === 'restaurant'
                ? 'Your default pickup point for new listings.'
                : 'Used to show food and trucks near you.'
          }
        >
          <LocationPicker
            value={form.location}
            onChange={set('location')}
            onResolve={(label) => setForm((f) => (f.address ? f : { ...f, address: label }))}
            autoLocate={false}
            height={280}
          />
          <Field label="Address" className="mt-4">
            {(id) => <input id={id} className="input" value={form.address} onChange={set('address')} placeholder="Street, area, city" />}
          </Field>
        </Card>

        <Card icon={FiBell} title="Notifications">
          <div className="space-y-5">
            {user.role === 'ngo' && (
              <div>
                <div className="label flex justify-between">
                  <span>Alert me about food within</span>
                  <span className="font-bold text-brand-300">{form.notifyRadiusKm} km</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={50}
                  value={form.notifyRadiusKm}
                  onChange={(e) => set('notifyRadiusKm')(Number(e.target.value))}
                  className="w-full accent-brand-400"
                />
                <p className="hint">A smaller radius means fewer, closer alerts your volunteers can reach quickly.</p>
              </div>
            )}
            <Toggle
              checked={form.emailNotifications}
              onChange={set('emailNotifications')}
              label="Email notifications"
              description={
                user.role === 'ngo'
                  ? 'Get an email for every new listing near you (in-app alerts are always on).'
                  : 'Get an email when your reports or reservations change status.'
              }
            />
          </div>
        </Card>

        <div className="flex justify-end">
          <button type="submit" className="btn btn-primary btn-lg" disabled={saving}>
            {saving ? <Spinner className="h-4 w-4" /> : <><FiSave /> Save changes</>}
          </button>
        </div>
      </form>

      <div className="mt-6">
        <PasswordCard user={user} onSaved={setUser} />
      </div>
    </div>
  );
}
