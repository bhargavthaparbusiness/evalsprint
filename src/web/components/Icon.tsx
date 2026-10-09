import { GITHUB_PATH, ICONS, type IconName } from "../design/icons";

export function Icon({ name, className }: { name: IconName | "github"; className?: string }) {
  const cls = `icon${className ? ` ${className}` : ""}`;
  if (name === "github") {
    return (
      <svg className={`${cls} icon-fill`} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d={GITHUB_PATH} />
      </svg>
    );
  }
  return (
    <svg className={cls} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={ICONS[name]} />
    </svg>
  );
}
