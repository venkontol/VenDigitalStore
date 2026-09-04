import router from "./router.js";

export default {
  async fetch(request, env, ctx) {
    return await router(request, env, ctx);
  }
};
