import { SatellitesModuleModal } from "./SatellitesModuleModal";
import { DocumentModuleModal } from "./DocumentModuleModal";
import { SettingsModal } from "./SettingsModal";
import { UserProfileModal } from "./UserProfileModal";
import { useSidebarModules } from "./SidebarModulesProvider";

export function SidebarModulesHost() {
  const { activeModule, closeModule } = useSidebarModules();

  return (
    <>
      <SatellitesModuleModal />
      <DocumentModuleModal
        module="discussions"
        open={activeModule === "discussions"}
        onClose={closeModule}
        title="Recent Discussions"
        accept=".pdf,.xlsx,.xls,.csv,application/pdf"
      />
      <DocumentModuleModal
        module="reports"
        open={activeModule === "reports"}
        onClose={closeModule}
        title="Reports and Returns"
        accept=".xlsx,.xls,.csv"
      />
      <SettingsModal />
      <UserProfileModal />
    </>
  );
}
