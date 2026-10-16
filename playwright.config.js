import {defineConfig} from '@playwright/test';
export default defineConfig({
 testDir:'./e2e',timeout:180000,workers:1,
 use:{baseURL:'http://127.0.0.1:4173/Nba-draft-simulator/',viewport:{width:390,height:844}},
 webServer:{command:'npx vite preview --host 127.0.0.1 --port 4173',url:'http://127.0.0.1:4173/Nba-draft-simulator/',reuseExistingServer:false},
 reporter:'list'
});
