import { InviteUserForm } from './InviteUserForm';

export default function InviteUserPage() {
  return (
    <div className="max-w-lg">
      <div className="mb-6 pb-4 border-b border-stone-300">
        <h2 className="text-2xl text-stone-800" style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 600 }}>
          Invite New User
        </h2>
        <p className="text-sm text-stone-500 italic">An invitation email will be sent to the address provided.</p>
      </div>
      <InviteUserForm />
    </div>
  );
}
