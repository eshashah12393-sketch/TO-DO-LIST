/* ============================================================
   TaskFlow — Premium Dashboard Logic
   Vanilla JS · Full CRUD · Priority · Search · Filters · Storage
   ============================================================ */

// ---------- Constants ----------
const STORAGE_KEY = "taskflow.tasks.v2"; // v2 → includes priority field

/** Priority metadata for badges / sorting. */
const PRIORITY = {
  high:   { label: "High",   rank: 0 },
  medium: { label: "Medium", rank: 1 },
  low:    { label: "Low",    rank: 2 },
};

// ---------- DOM References ----------
const form           = document.getElementById("task-form");
const input          = document.getElementById("task-input");
const searchInput    = document.getElementById("search-input");
const list           = document.getElementById("task-list");
const emptyState     = document.getElementById("empty-state");
const emptyTitle     = document.getElementById("empty-title");
const emptyText      = document.getElementById("empty-text");
const footer         = document.getElementById("footer");
const footerInfo     = document.getElementById("footer-info");
const countTotal     = document.getElementById("count-total");
const countActive    = document.getElementById("count-active");
const countDone      = document.getElementById("count-done");
const countHigh      = document.getElementById("count-high");
const clearCompletedBtn = document.getElementById("clear-completed");
const clearAllBtn       = document.getElementById("clear-all");
const clockEl           = document.getElementById("clock");

// ---------- State ----------
/**
 * @typedef {Object} Task
 * @property {string} id
 * @property {string} text
 * @property {boolean} done
 * @property {"high"|"medium"|"low"} priority
 * @property {number} createdAt
 */

/** @type {Task[]} */
let tasks = [];

/** UI filter state (not persisted). */
const filters = {
  search: "",
  status: "all",     // all | active | completed
  priority: "all",   // all | high | medium | low
};

// ============================================================
// Persistence
// ============================================================

/** Load tasks from localStorage, migrating v1 data if present. */
function loadTasks() {
  try {
    // Try v2 first, fall back to legacy v1 key for migration.
    const raw = localStorage.getItem(STORAGE_KEY)
             ?? localStorage.getItem("taskflow.tasks.v1");
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    // Normalise every entry so old data gains a priority field.
    return parsed
      .filter((t) => t && typeof t.text === "string")
      .map((t) => ({
        id: t.id || generateId(),
        text: t.text,
        done: Boolean(t.done),
        priority: PRIORITY[t.priority] ? t.priority : "medium",
        createdAt: t.createdAt || Date.now(),
      }));
  } catch (err) {
    console.warn("Failed to load tasks:", err);
    return [];
  }
}

/** Persist the full task array to localStorage. */
function saveTasks() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  } catch (err) {
    console.warn("Failed to save tasks:", err);
  }
}

// ============================================================
// Helpers
// ============================================================

/** Generate a unique, collision-resistant ID. */
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/** Escape HTML entities to prevent XSS when injecting user text. */
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

/** Format a timestamp as a short relative / clock label. */
function formatTime(ts) {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// ============================================================
// Filtering
// ============================================================

/** Return the subset of tasks matching the current search + filters. */
function getVisibleTasks() {
  const q = filters.search.trim().toLowerCase();

  return tasks.filter((task) => {
    // Status filter
    if (filters.status === "active" && task.done) return false;
    if (filters.status === "completed" && !task.done) return false;

    // Priority filter
    if (filters.priority !== "all" && task.priority !== filters.priority) {
      return false;
    }

    // Search filter (case-insensitive, partial match)
    if (q && !task.text.toLowerCase().includes(q)) return false;

    return true;
  });
}

// ============================================================
// Rendering
// ============================================================

/** Render visible tasks, stats, empty state, and footer. */
function render() {
  const visible = getVisibleTasks();

  list.innerHTML = "";
  visible.forEach((task) => list.appendChild(createTaskElement(task)));

  updateStats();
  updateEmptyState(visible);
  updateFooter(visible);
}

/** Build a single task <li> element. */
function createTaskElement(task) {
  const li = document.createElement("li");
  li.className =
    `task task--${task.priority}` + (task.done ? " task--done" : "");
  li.dataset.id = task.id;

  li.innerHTML = `
    <input
      type="checkbox"
      class="task__check"
      ${task.done ? "checked" : ""}
      aria-label="Mark task as ${task.done ? "incomplete" : "complete"}"
    />
    <div class="task__body">
      <span class="task__text">${escapeHtml(task.text)}</span>
      <div class="task__meta">
        <span class="badge badge--${task.priority}">${PRIORITY[task.priority].label}</span>
        <span class="task__time">${formatTime(task.createdAt)}</span>
      </div>
    </div>
    <div class="task__actions">
      <button class="task__btn task__btn--edit" type="button" title="Edit" aria-label="Edit task">✎</button>
      <button class="task__btn task__btn--delete" type="button" title="Delete" aria-label="Delete task">🗑</button>
    </div>
  `;

  // Toggle complete
  li.querySelector(".task__check").addEventListener("change", () => {
    toggleTask(task.id);
  });

  // Inline edit
  li.querySelector(".task__btn--edit").addEventListener("click", () => {
    startEditing(li, task);
  });

  // Delete with exit animation (listener + timeout fallback)
  li.querySelector(".task__btn--delete").addEventListener("click", () => {
    li.classList.add("task--removing");
    li.addEventListener("transitionend", () => deleteTask(task.id), { once: true });
    setTimeout(() => deleteTask(task.id), 350);
  });

  return li;
}

/** Update the four stat cards. */
function updateStats() {
  const total   = tasks.length;
  const done    = tasks.filter((t) => t.done).length;
  const high    = tasks.filter((t) => t.priority === "high" && !t.done).length;
  countTotal.textContent  = total;
  countActive.textContent = total - done;
  countDone.textContent   = done;
  countHigh.textContent   = high;
}

/** Show contextual empty-state message. */
function updateEmptyState(visible) {
  const hasVisible = visible.length > 0;
  emptyState.hidden = hasVisible;
  if (hasVisible) return;

  if (tasks.length === 0) {
    emptyTitle.textContent = "No tasks yet";
    emptyText.textContent  = "Add your first task above to get started.";
  } else if (filters.search) {
    emptyTitle.textContent = "No matches found";
    emptyText.textContent  = `Nothing matches “${filters.search}”. Try a different search.`;
  } else {
    emptyTitle.textContent = "No tasks in this view";
    emptyText.textContent  = "Try switching the filter tabs above.";
  }
}

/** Update footer info line + visibility. */
function updateFooter(visible) {
  footer.hidden = tasks.length === 0;
  const remaining = tasks.filter((t) => !t.done).length;
  footerInfo.textContent =
    `${visible.length} shown · ${remaining} remaining of ${tasks.length}`;
}

// ============================================================
// CRUD Operations
// ============================================================

/** Add a new task using the composer input + selected priority. */
function addTask(text) {
  const trimmed = text.trim();
  if (!trimmed) return;

  const selected = form.querySelector('input[name="priority"]:checked');
  const priority = selected ? selected.value : "medium";

  // Unshift so the newest task appears first.
  tasks.unshift({
    id: generateId(),
    text: trimmed,
    done: false,
    priority,
    createdAt: Date.now(),
  });

  saveTasks();
  render();
}

/** Toggle a task's completed flag. */
function toggleTask(id) {
  const task = tasks.find((t) => t.id === id);
  if (!task) return;
  task.done = !task.done;
  saveTasks();
  render();
}

/** Permanently remove a task by id. */
function deleteTask(id) {
  tasks = tasks.filter((t) => t.id !== id);
  saveTasks();
  render();
}

/** Update a task's text from the inline editor. */
function updateTaskText(id, newText) {
  const trimmed = newText.trim();
  const task = tasks.find((t) => t.id === id);
  if (!task || !trimmed) return;
  task.text = trimmed;
  saveTasks();
  render();
}

/** Remove all completed tasks. */
function clearCompleted() {
  tasks = tasks.filter((t) => !t.done);
  saveTasks();
  render();
}

/** Remove every task after confirmation. */
function clearAll() {
  if (tasks.length === 0) return;
  if (confirm("Delete ALL tasks? This cannot be undone.")) {
    tasks = [];
    saveTasks();
    render();
  }
}

// ============================================================
// Inline Editing
// ============================================================

/** Replace a task's text with an input for inline editing. */
function startEditing(li, task) {
  const body = li.querySelector(".task__body");
  const textSpan = li.querySelector(".task__text");
  if (!body || !textSpan) return;

  const editInput = document.createElement("input");
  editInput.type = "text";
  editInput.className = "task__edit";
  editInput.value = task.text;
  editInput.maxLength = 140;
  editInput.setAttribute("aria-label", "Edit task text");

  textSpan.replaceWith(editInput);
  editInput.focus();
  editInput.setSelectionRange(editInput.value.length, editInput.value.length);

  // Convert the edit button into a save button (fresh node → no stale listeners).
  const oldBtn = li.querySelector(".task__btn--edit");
  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.className = "task__btn task__btn--save";
  saveBtn.title = "Save";
  saveBtn.setAttribute("aria-label", "Save task");
  saveBtn.textContent = "✓";
  oldBtn.replaceWith(saveBtn);

  let finished = false;

  const commit = () => {
    if (finished) return;
    finished = true;
    updateTaskText(task.id, editInput.value);
  };

  const cancel = () => {
    if (finished) return;
    finished = true;
    render();
  };

  saveBtn.addEventListener("click", commit);

  editInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter")  { e.preventDefault(); commit(); }
    if (e.key === "Escape") { e.preventDefault(); cancel(); }
  });

  // Delay blur-commit so a click on Save registers first.
  editInput.addEventListener("blur", () => setTimeout(commit, 120));
}

// ============================================================
// Clock
// ============================================================

/** Live clock shown in the header. */
function tickClock() {
  const now = new Date();
  clockEl.textContent = now.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

// ============================================================
// Event Listeners
// ============================================================

// Add task
form.addEventListener("submit", (e) => {
  e.preventDefault();
  addTask(input.value);
  input.value = "";
  input.focus();
});

// Real-time search
searchInput.addEventListener("input", () => {
  filters.search = searchInput.value;
  render();
});

// Status filter tabs
document.querySelectorAll(".tab[data-filter]").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab[data-filter]").forEach((t) => {
      t.classList.remove("is-active");
      t.setAttribute("aria-selected", "false");
    });
    tab.classList.add("is-active");
    tab.setAttribute("aria-selected", "true");
    filters.status = tab.dataset.filter;
    render();
  });
});

// Priority filter tabs
document.querySelectorAll(".tab[data-prio]").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab[data-prio]").forEach((t) => {
      t.classList.remove("is-active");
      t.setAttribute("aria-selected", "false");
    });
    tab.classList.add("is-active");
    tab.setAttribute("aria-selected", "true");
    filters.priority = tab.dataset.prio;
    render();
  });
});

// Footer bulk actions
clearCompletedBtn.addEventListener("click", clearCompleted);
clearAllBtn.addEventListener("click", clearAll);

// ---------- Initialise ----------
tasks = loadTasks();
render();
tickClock();
setInterval(tickClock, 1000);
