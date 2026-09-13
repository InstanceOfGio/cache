import type { FC, PropsWithChildren } from 'hono/jsx';

/** Pannello che sale dal basso, con velo cliccabile per chiudere. */
export const Overlay: FC<PropsWithChildren> = ({ children }) => (
  <div
    class="fixed inset-0 z-50 flex flex-col justify-end bg-ink/50 sm:justify-center sm:p-6"
    onclick="if(event.target===this)closeSheet()"
    role="dialog"
    aria-modal="true"
  >
    {/* dal basso sul telefono, centrato e rientrato su schermo largo */}
    <div class="animate-risein sm:mx-auto sm:w-full sm:max-w-md sm:animate-none sm:overflow-hidden sm:rounded-sheet">
      {children}
    </div>
  </div>
);

export const Avatar: FC<{ user: { name?: string; display_name?: string; color: string }; size?: number }> = ({
  user,
  size = 26,
}) => {
  const name = user.display_name ?? user.name ?? '?';
  return (
    <span
      class="grid flex-none place-items-center rounded-full font-display font-bold text-paper"
      style={`width:${size}px;height:${size}px;background:${user.color};font-size:${Math.round(size * 0.5)}px`}
      title={name}
    >
      {name.trim().charAt(0).toUpperCase()}
    </span>
  );
};
