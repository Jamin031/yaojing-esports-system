import { defineStore } from 'pinia';

export const useAppStore = defineStore('app', {
  state: () => ({
    sidebarCollapsed: false,
    mobileViewport: false,
    mobileSidebarOpen: false,
  }),
  actions: {
    setMobileViewport(value) {
      this.mobileViewport = Boolean(value);
      if (!this.mobileViewport) {
        this.mobileSidebarOpen = false;
      }
    },
    toggleSidebar() {
      if (this.mobileViewport) {
        this.mobileSidebarOpen = !this.mobileSidebarOpen;
        return;
      }
      this.sidebarCollapsed = !this.sidebarCollapsed;
    },
    closeMobileSidebar() {
      this.mobileSidebarOpen = false;
    },
  },
});
