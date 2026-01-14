const $ = (id) => document.getElementById(id);

function setStatus(el, msg, ok = true) {
  el.textContent = msg;
  el.classList.toggle("ok", ok);
  el.classList.toggle("bad", !ok);
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });

  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  if (!res.ok) {
    const msg =
      (body && body.message) ||
      (body && body.error) ||
      (typeof body === "string" ? body : null) ||
      `Request failed (${res.status})`;
    const err = new Error(msg);
    err.status = res.status;
    err.body = body;
    throw err;
  }

  return body;
}

async function checkHealth() {
  const el = $("health");
  try {
    const data = await api("/health");
    setStatus(el, data?.status === "ok" ? "ok" : JSON.stringify(data), true);
  } catch (e) {
    setStatus(el, e.message || "down", false);
  }
}

async function register() {
  const status = $("regStatus");
  setStatus(status, "Registering…", true);

  const payload = {
    firstName: $("regFirstName").value.trim(),
    lastName: $("regLastName").value.trim(),
    userName: $("regUserName").value.trim(),
    email: $("regEmail").value.trim(),
    password: $("regPassword").value,
    hireDate: $("regHireDate").value.trim() || undefined,
  };

  try {
    const out = await api("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    setStatus(status, `✅ Registered: ${out?.user?.email || "ok"}`, true);
  } catch (e) {
    setStatus(status, `❌ ${e.message}`, false);
  }
}

async function login() {
  const status = $("loginStatus");
  setStatus(status, "Logging in…", true);

  const payload = {
    email: $("loginEmail").value.trim(),
    password: $("loginPassword").value,
  };

  try {
    const out = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    setStatus(status, `✅ Logged in: ${out?.user?.email || "ok"}`, true);
  } catch (e) {
    setStatus(status, `❌ ${e.message}`, false);
  }
}

async function loadUsers() {
  const outEl = $("usersOut");
  outEl.value = "Loading…";
  const excludeFiles = $("excludeFiles").checked;

  try {
    const users = await api(`/api/users?excludeFiles=${excludeFiles ? "true" : "false"}`);
    outEl.value = JSON.stringify(users, null, 2);
  } catch (e) {
    outEl.value = `Error: ${e.message}\n\n${JSON.stringify(e.body ?? null, null, 2)}`;
  }
}

$("btnRegister").addEventListener("click", register);
$("btnLogin").addEventListener("click", login);
$("btnLoadUsers").addEventListener("click", loadUsers);

checkHealth();

