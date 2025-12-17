// /scripts/authFetch.js
(() => {
  const AUTH_ORIGIN = "http://localhost:8080";
  const ACCESS_KEY = "accessToken";

  let refreshPromise = null;

  function getAccessToken() {
    return sessionStorage.getItem(ACCESS_KEY);
  }

  function setAccessToken(token) {
    if (token) sessionStorage.setItem(ACCESS_KEY, token);
    else sessionStorage.removeItem(ACCESS_KEY);
  }

  async function refreshAccessToken() {
    if (refreshPromise) return refreshPromise;

    refreshPromise = (async () => {
      const res = await fetch(`${AUTH_ORIGIN}/token`, {
        method: "POST",
        credentials: "include", // sends refreshToken cookie
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.accessToken) {
        setAccessToken(null);
        // refresh cookie is missing/expired/invalid
        window.location.replace("/login");
        return null;
      }

      setAccessToken(data.accessToken);
      return data.accessToken;
    })();

    try {
      return await refreshPromise;
    } finally {
      refreshPromise = null;
    }
  }

  async function authFetch(input, init = {}, opts = {}) {
    const retry = opts.retry !== false;

    const headers = new Headers(init.headers || {});
    const token = getAccessToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);

    let res = await fetch(input, { ...init, headers });

    // If access token is expired/invalid, try refresh once and retry once
    if ((res.status === 401 || res.status === 403) && retry) {
      const newTok = await refreshAccessToken(); // will redirect on failure
      if (!newTok) return res;

      const headers2 = new Headers(init.headers || {});
      headers2.set("Authorization", `Bearer ${newTok}`);
      res = await fetch(input, { ...init, headers: headers2 });
    }

    // If still unauthorized, force login
    if (res.status === 401 || res.status === 403) {
      setAccessToken(null);
      window.location.replace("/login");
    }

    return res;
  }

  window.authFetch = authFetch;
  window.refreshAccessToken = refreshAccessToken;
})();
