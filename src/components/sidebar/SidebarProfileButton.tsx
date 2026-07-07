import { User } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useUserAccount } from "@/lib/userAccountStore";

type Props = {
  active: boolean;
  onClick: () => void;
  className?: string;
};

export function SidebarProfileButton({ active, onClick, className }: Props) {
  const account = useUserAccount();

  const initials = account.displayName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <button
      type="button"
      onClick={onClick}
      className={className}
      title="User profile"
    >
      <Avatar className="h-5 w-5 shrink-0 border border-border">
        {account.avatarDataUrl ? (
          <AvatarImage src={account.avatarDataUrl} alt={account.displayName} />
        ) : null}
        <AvatarFallback className="bg-secondary text-secondary-foreground text-[8px] mono">
          {initials ? initials : <User className="h-3 w-3 text-secondary-foreground" />}
        </AvatarFallback>
      </Avatar>
      <span className="truncate">{account.displayName}</span>
    </button>
  );
}
