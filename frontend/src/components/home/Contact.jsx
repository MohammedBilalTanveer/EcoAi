import { useRef, useState } from 'react';
import emailjs from '@emailjs/browser';
import { FiMail, FiSend } from 'react-icons/fi';
import { toast } from 'react-toastify';
import { Spinner } from '../ui';

// EmailJS public identifiers (safe to ship in the browser).
const EMAILJS = { service: 'service_hc3ymvj', template: 'template_ez9bw4e', publicKey: 'EZd_-9QWM0kBzphGC' };

export default function Contact() {
  const form = useRef(null);
  const [sending, setSending] = useState(false);

  const sendEmail = async (e) => {
    e.preventDefault();
    setSending(true);
    try {
      await emailjs.sendForm(EMAILJS.service, EMAILJS.template, form.current, EMAILJS.publicKey);
      form.current.reset();
      toast.success('Message sent — we’ll get back to you soon!');
    } catch {
      toast.error('Failed to send message. Please try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="card grid overflow-hidden lg:grid-cols-[1fr_1.2fr]">
      <div className="relative bg-gradient-to-br from-brand-500/20 via-transparent to-accent/20 p-8 sm:p-10">
        <div className="grid-bg absolute inset-0 opacity-50" />
        <div className="relative">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-400/15 text-2xl text-brand-300">
            <FiMail />
          </span>
          <h2 className="mt-5 text-3xl">Let’s build a greener city together</h2>
          <p className="mt-3 text-ink-300">
            Municipal partner, restaurant chain, NGO or volunteer group? Tell us what you’re working on and we’ll help you
            get started.
          </p>
        </div>
      </div>
      <form ref={form} onSubmit={sendEmail} className="grid gap-4 p-8 sm:grid-cols-2 sm:p-10">
        <input type="text" name="user_name" placeholder="Your name" required className="input" />
        <input type="email" name="user_email" placeholder="Your email" required className="input" />
        <input type="text" name="subject" placeholder="Subject" required className="input sm:col-span-2" />
        <textarea name="message" placeholder="Message" rows={4} required className="input sm:col-span-2" />
        <button type="submit" className="btn btn-primary sm:col-span-2" disabled={sending}>
          {sending ? <Spinner className="h-4 w-4" /> : <><FiSend /> Send message</>}
        </button>
      </form>
    </div>
  );
}
