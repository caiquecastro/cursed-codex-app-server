const sessionList = document.getElementById("session-list");
const messageList = document.getElementById("message-list");
const rawPayload = document.getElementById("raw-payload");
const sessionTitle = document.getElementById("session-title");
const sessionMeta = document.getElementById("session-meta");

let selectedSessionId = null;
let currentMessages = [];

async function fetchJson(path) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return await response.json();
}

function formatDate(value) {
  return new Date(value).toLocaleString();
}

function renderSessions(sessions) {
  sessionList.innerHTML = "";
  if (!sessions.length) {
    sessionList.innerHTML = `<div class="empty">No captured sessions yet.</div>`;
    return;
  }

  for (const session of sessions) {
    const button = document.createElement("button");
    button.className = `session-item ${selectedSessionId === session.id ? "active" : ""}`;
    button.innerHTML = `
      <span class="status ${session.status}">${session.status}</span>
      <strong>${session.id.slice(0, 8)}</strong>
      <span>${formatDate(session.updatedAt)}</span>
    `;
    button.addEventListener("click", () => {
      selectedSessionId = session.id;
      void loadSession(session.id);
      renderSessions(sessions);
    });
    sessionList.appendChild(button);
  }
}

function renderMessages(messages) {
  currentMessages = messages;
  messageList.innerHTML = "";
  if (!messages.length) {
    messageList.innerHTML = `<div class="empty">No messages captured for this session.</div>`;
    return;
  }

  for (const message of messages) {
    const button = document.createElement("button");
    button.className = `message-item ${message.direction} ${message.category}`;
    button.innerHTML = `
      <span class="pill">${message.direction}</span>
      <span class="pill muted">${message.category}</span>
      <strong>${message.summary || message.method || "message"}</strong>
      <span>${formatDate(message.timestamp)}</span>
    `;
    button.addEventListener("click", () => {
      rawPayload.textContent = message.payload;
    });
    messageList.appendChild(button);
  }
}

async function loadSessions() {
  const data = await fetchJson("/api/sessions");
  renderSessions(data.sessions);
  if (!selectedSessionId && data.sessions.length) {
    selectedSessionId = data.sessions[0].id;
    await loadSession(selectedSessionId);
    renderSessions(data.sessions);
  }
}

async function loadSession(sessionId) {
  const data = await fetchJson(`/api/sessions/${sessionId}`);
  sessionTitle.textContent = `Session ${sessionId.slice(0, 8)}`;
  sessionMeta.textContent = `${data.session.status} | created ${formatDate(data.session.createdAt)} | updated ${formatDate(data.session.updatedAt)}`;
  renderMessages(data.messages);
  rawPayload.textContent = data.messages[0]?.payload || "Select a message to inspect raw JSON.";
}

const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
const dashboardSocket = new WebSocket(`${protocol}//${window.location.host}/dashboard-ws`);
dashboardSocket.addEventListener("message", async () => {
  await loadSessions();
  if (selectedSessionId) {
    await loadSession(selectedSessionId);
  }
});

void loadSessions();
