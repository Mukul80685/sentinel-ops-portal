import { createContext, useContext, useState, type ReactNode } from "react";

export type SidebarModule =
  | "satellites"
  | "discussions"
  | "reports"
  | "settings"
  | "profile"
  | null;

type SidebarModulesContextValue = {
  activeModule: SidebarModule;
  openModule: (module: Exclude<SidebarModule, null>) => void;
  closeModule: () => void;
};

const SidebarModulesCtx = createContext<SidebarModulesContextValue>({
  activeModule: null,
  openModule: () => {},
  closeModule: () => {},
});

export function SidebarModulesProvider({ children }: { children: ReactNode }) {
  const [activeModule, setActiveModule] = useState<SidebarModule>(null);

  return (
    <SidebarModulesCtx.Provider
      value={{
        activeModule,
        openModule: (module) => setActiveModule(module),
        closeModule: () => setActiveModule(null),
      }}
    >
      {children}
    </SidebarModulesCtx.Provider>
  );
}

export function useSidebarModules() {
  return useContext(SidebarModulesCtx);
}
