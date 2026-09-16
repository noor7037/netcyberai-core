export type DemoRole = 'principal' | 'teacher' | 'parent';

const roles: { id: DemoRole; label: string }[] = [
  { id: 'principal', label: 'Principal' },
  { id: 'teacher', label: 'Teacher' },
  { id: 'parent', label: 'Parent' },
];

export function RoleSwitcher({
  active,
  onChange,
}: {
  active: DemoRole;
  onChange: (role: DemoRole) => void;
}) {
  return (
    <div role="tablist" aria-label="Switch role" className="grid grid-cols-3 gap-2">
      {roles.map((role) => {
        const isActive = role.id === active;
        return (
          <button
            key={role.id}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(role.id)}
            className={`min-h-[44px] rounded-md px-3 py-2 text-sm font-semibold transition-colors ${
              isActive
                ? 'bg-sapphire text-off-white'
                : 'bg-white text-slate border border-slate/20'
            }`}
          >
            {role.label}
          </button>
        );
      })}
    </div>
  );
}
