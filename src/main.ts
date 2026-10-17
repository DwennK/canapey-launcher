import { createApp } from "vue";
import App from "./App.vue";
import "./style.css";
import { startupMark } from "./lib/startup";
startupMark("entry");
createApp(App).mount("#app");
startupMark("mounted");
