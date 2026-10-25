// HCM Lite - simple JavaScript (no framework, data in localStorage)

// ---------- Which page is this? ----------
var pageName = document.body.getAttribute("data-page") || location.pathname.split("/").pop().replace(".html", "");
if (pageName === "setting") pageName = "settings";
var isIndex = pageName === "index" || pageName === "";
var PAGES = isIndex ? "pages/" : "";                                  // path to the pages folder
var ROOT = isIndex || location.pathname.indexOf("/pages/") === -1 ? "" : "../"; // path to index.html

// ---------- Storage ----------
function getData(key, fallback) {
  try {
    var v = JSON.parse(localStorage.getItem(key));
    return v === null ? fallback : v;
  } catch (e) {
    return fallback;
  }
}
function setData(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}
function getCompany() { return getData("hcm_company", null); }
function getUsers() { return getData("hcm_users", []); }
function getAttendance() { return getData("hcm_attendance", []); }
function getLeaves() { return getData("hcm_leaves", []); }
function getNotes() { return getData("hcm_notes", []); }

function currentUser() {
  var session = getData("hcm_session", null);
  if (!session) return null;
  var users = getUsers();
  for (var i = 0; i < users.length; i++) {
    if (users[i].id === session.id) return users[i];
  }
  return null;
}
function goHome(user) {
  return PAGES + (user.role === "admin" ? "admin.html" : "employee.html");
}
function getEmployees() {
  var all = getUsers(), list = [];
  for (var i = 0; i < all.length; i++) if (all[i].role === "employee") list.push(all[i]);
  return list;
}

// ---------- Small helpers ----------
function $(selector, parent) { return (parent || document).querySelector(selector); }
function $$(selector, parent) { return Array.from((parent || document).querySelectorAll(selector)); }
function escapeHtml(text) {
  var map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return String(text == null ? "" : text).replace(/[&<>"']/g, function (c) { return map[c]; });
}
function pad(n) { return n < 10 ? "0" + n : "" + n; }
function dateToString(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
function today() { return dateToString(new Date()); }
function nowTime() { var d = new Date(); return pad(d.getHours()) + ":" + pad(d.getMinutes()); }
function toMinutes(t) { var p = t.split(":"); return Number(p[0]) * 60 + Number(p[1]); }
function isWorkingDay(d) {
  var days = getCompany().days || [1, 2, 3, 4, 5];
  return days.indexOf(d.getDay()) !== -1;
}
function countWorkDays(from, to) {
  var count = 0, d = new Date(from + "T00:00:00"), end = new Date(to + "T00:00:00");
  while (d <= end) {
    if (isWorkingDay(d)) count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
}
function nextEmployeeId() {           // EMP-001, EMP-002, ...
  var max = 0, users = getUsers();
  for (var i = 0; i < users.length; i++) {
    if (users[i].empId) {
      var n = Number(users[i].empId.slice(4));
      if (n > max) max = n;
    }
  }
  return "EMP-" + String(max + 1).padStart(3, "0");
}
function leaveDaysUsed(userId, statuses) {
  var total = 0, leaves = getLeaves();
  for (var i = 0; i < leaves.length; i++) {
    if (leaves[i].uid === userId && statuses.indexOf(leaves[i].status) !== -1) total += leaves[i].days;
  }
  return total;
}
function showToast(message) {
  var box = document.createElement("div");
  box.className = "toast";
  box.textContent = message;
  document.body.appendChild(box);
  setTimeout(function () { box.remove(); }, 2500);
}
function field(name, label, type, extra) {
  return "<label class=f>" + label + "<input name=" + name + " type=" + (type || "text") + " " + (extra || "") +
    "><small data-e=" + name + "></small></label>";
}
function getFormData(form) { return Object.fromEntries(new FormData(form)); }
function showErrors(form, errors) {      // shows error next to each field; true if no errors
  var smalls = $$("[data-e]", form);
  for (var i = 0; i < smalls.length; i++) smalls[i].textContent = errors[smalls[i].getAttribute("data-e")] || "";
  return Object.keys(errors).length === 0;
}
function validEmail(email) { return /^\S+@\S+\.\S+$/.test(email); }

// ---------- Page layout (sidebar) ----------
function drawLayout(active, html) {
  var user = currentUser();
  var links = user.role === "admin"
    ? [["admin", "📊 Dashboard"], ["employees", "👥 Employees"], ["leaves", "🗓️ Leaves"], ["settings", "⚙️ Settings"], ["payslip", "🧾 Payslips"]]
    : [["employee", "🏠 Dashboard"], ["payslip", "🧾 Payslip"]];
  var nav = "";
  for (var i = 0; i < links.length; i++) {
    nav += '<a href="' + links[i][0] + '.html" class="' + (links[i][0] === active ? "on" : "") + '">' + links[i][1] + "</a>";
  }
  $("#app").innerHTML =
    '<div class=app><aside><a class=brand href="' + goHome(user) + '">🏢 HCM Lite</a><nav aria-label=Main>' + nav + "</nav>" +
    "<div class=me><b>" + escapeHtml(user.name) + "</b><small>" + user.role + (user.empId ? " · " + user.empId : "") + "</small>" +
    '<button class="btn ghost sm" id=out>Logout</button></div></aside><main class=in>' + html + "</main></div>";
  $("#out").onclick = function () {
    localStorage.removeItem("hcm_session");
    location = ROOT + "index.html";
  };
}

// ---------- Smart helper (chat) ----------
var chatHTML = '<section class=card><h2>🤖 Smart helper</h2><div class=msgs id=msgs><p class="m bot">Hi! Ask me about leaves, attendance or employees.</p></div>' +
  '<form id=cf class=row style="margin:0"><input id=chatInput placeholder="Ask a question…" aria-label=Question autocomplete=off><button class=btn style="flex:0">Send</button></form></section>';

function startChat(user) {
  $("#cf").onsubmit = function (e) {
    e.preventDefault();
    var q = $("#chatInput").value.trim();
    if (!q) return;
    addMessage(q, "me");
    addMessage(getAnswer(q, user), "bot");
    $("#chatInput").value = "";
  };
}
function addMessage(text, who) {
  $("#msgs").insertAdjacentHTML("beforeend", '<p class="m ' + who + '">' + escapeHtml(text) + "</p>");
  $("#msgs").scrollTop = 100000;
}
function nameOf(id) {
  var list = getEmployees();
  for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i].name;
  return "?";
}
function getAnswer(question, user) {
  var t = question.toLowerCase(), d = today(), i;
  var leaves = getLeaves(), onLeave = [], todayRecords = [];
  for (i = 0; i < leaves.length; i++) {
    if (leaves[i].status === "approved" && leaves[i].from <= d && leaves[i].to >= d) onLeave.push(leaves[i]);
  }
  var all = getAttendance();
  for (i = 0; i < all.length; i++) if (all[i].date === d) todayRecords.push(all[i]);

  if (user.role === "admin") {
    if (t.indexOf("employee") !== -1 && (t.indexOf("how many") !== -1 || t.indexOf("total") !== -1 || t.indexOf("count") !== -1))
      return "You have " + getEmployees().length + " employee(s).";
    if (t.indexOf("pending") !== -1) {
      var p = 0;
      for (i = 0; i < leaves.length; i++) if (leaves[i].status === "pending") p++;
      return p + " leave request(s) are pending.";
    }
    if (t.indexOf("leave") !== -1) {
      var names = [];
      for (i = 0; i < onLeave.length; i++) names.push(nameOf(onLeave[i].uid));
      return onLeave.length + " on leave today" + (names.length ? ": " + names.join(", ") : "") + ".";
    }
    if (t.indexOf("late") !== -1) {
      var late = [];
      for (i = 0; i < todayRecords.length; i++) if (todayRecords[i].late) late.push(nameOf(todayRecords[i].uid));
      return late.length + " late today" + (late.length ? ": " + late.join(", ") : "") + ".";
    }
    if (t.indexOf("present") !== -1 || t.indexOf("attend") !== -1) return todayRecords.length + " employee(s) checked in today.";
    return 'Try: "How many employees do we have?", "Who is on leave today?" or "Who was late today?"';
  }

  // Employee: only their own data
  var quota = getCompany().leaveQuota;
  if (t.indexOf("leave") !== -1 || t.indexOf("balance") !== -1)
    return "You have " + (quota - leaveDaysUsed(user.id, ["approved"])) + " of " + quota + " leave days left.";
  if (t.indexOf("late") !== -1) {
    for (i = 0; i < todayRecords.length; i++) {
      if (todayRecords[i].uid === user.id)
        return todayRecords[i].late ? "Yes, you checked in late at " + todayRecords[i].in + "." : "No, you were on time (" + todayRecords[i].in + ").";
    }
    return "You have not checked in today.";
  }
  if (t.indexOf("hour") !== -1) {
    var weekAgo = dateToString(new Date(Date.now() - 6 * 86400000)), hours = 0;
    for (i = 0; i < all.length; i++) {
      if (all[i].uid === user.id && all[i].date >= weekAgo && all[i].out) hours += (toMinutes(all[i].out) - toMinutes(all[i].in)) / 60;
    }
    return "You worked " + hours.toFixed(1) + " hours in the last 7 days.";
  }
  return 'Try: "How many leaves do I have left?", "Was I late today?" or "How many hours did I work this week?"';
}

// ---------- Change password card ----------
var passwordCard = '<section class=card><h2>🔒 Change password</h2><form id=pf novalidate class=grid>' +
  field("pw", "New password", "password") + "<div><button class=btn>Update</button></div></form></section>";

function startPasswordForm(user) {
  $("#pf").onsubmit = function (e) {
    e.preventDefault();
    var form = e.target, v = getFormData(form), errors = {};
    if (v.pw.length < 4) errors.pw = "Min 4 characters";
    if (!showErrors(form, errors)) return;
    var users = getUsers();
    for (var i = 0; i < users.length; i++) if (users[i].id === user.id) users[i].password = v.pw;
    setData("hcm_users", users);
    form.reset();
    showToast("Password updated");
  };
}

// =====================================================
// PAGES
// =====================================================
var pages = {};

// ---------- index.html: setup + login ----------
pages.index = function () {
  if (currentUser()) { location = goHome(currentUser()); return; }
  var company = getCompany();
  $("#app").innerHTML = '<div class=auth><section class="card auth-c"><h1>🏢 HCM Lite</h1><p class=mut>' +
    (company ? "Sign in to " + escapeHtml(company.name) : "First run: create your company and Admin account") +
    "</p><form id=f novalidate>" + (company ? "" : field("company", "Company name") + field("name", "Admin name")) +
    field("email", "Email", "email") + field("password", "Password", "password") +
    "<button class=btn>" + (company ? "Sign in" : "Create company") + "</button></form></section></div>";

  $("#f").onsubmit = function (e) {
    e.preventDefault();
    var form = e.target, v = getFormData(form), errors = {};
    if (!validEmail(v.email)) errors.email = "Enter a valid email";
    if (!v.password) errors.password = "Password is required";

    if (!company) {                                   // first-run setup
      if (!v.company.trim()) errors.company = "Company name is required";
      if (!v.name.trim()) errors.name = "Name is required";
      if (v.password.length < 4) errors.password = "Min 4 characters";
      if (!showErrors(form, errors)) return;
      var admin = { id: Date.now(), name: v.name.trim(), email: v.email.trim(), password: v.password, role: "admin", joined: today() };
      setData("hcm_company", { name: v.company.trim(), startTime: "09:00", cutoff: "12:00", grace: 15, leaveQuota: 20, days: [1, 2, 3, 4, 5] });
      setData("hcm_users", [admin]);
      setData("hcm_session", { id: admin.id });
      location = PAGES + "admin.html";
      return;
    }

    var users = getUsers(), found = null;             // login
    for (var i = 0; i < users.length; i++) {
      if (users[i].email.toLowerCase() === v.email.toLowerCase() && users[i].password === v.password) found = users[i];
    }
    if (!errors.email && !errors.password && !found) errors.password = "Wrong email or password";
    if (!showErrors(form, errors)) return;
    setData("hcm_session", { id: found.id });
    location = goHome(found);
  };
};

// ---------- admin.html: dashboard ----------
pages.admin = function () {
  var user = currentUser(), d = today(), i;
  var records = getAttendance(), leaves = getLeaves();
  var present = 0, late = 0, onLeave = 0, pending = 0;
  for (i = 0; i < records.length; i++) {
    if (records[i].date === d) { present++; if (records[i].late) late++; }
  }
  for (i = 0; i < leaves.length; i++) {
    if (leaves[i].status === "approved" && leaves[i].from <= d && leaves[i].to >= d) onLeave++;
    if (leaves[i].status === "pending") pending++;
  }
  var stats = [["Employees", getEmployees().length], ["Present today", present], ["Late today", late], ["On leave", onLeave], ["Pending leaves", pending]];
  var cards = "";
  for (i = 0; i < stats.length; i++) cards += "<div class=card><b>" + stats[i][1] + "</b>" + stats[i][0] + "</div>";

  drawLayout("admin", "<h1>Welcome, " + escapeHtml(user.name) + " 👋</h1><div class=stats>" + cards + "</div>" +
    '<section class=card><h2>📢 Announcements</h2><form id=nf class=row><input name=text placeholder="Post an announcement" aria-label=Announcement required>' +
    '<button class=btn style="flex:0">Post</button></form><div id=nl></div></section>' + chatHTML);

  function drawNotes() {
    var notes = getNotes().slice(-5).reverse(), html = "";
    for (var j = 0; j < notes.length; j++) html += "<p>• " + escapeHtml(notes[j].text) + " <small>" + notes[j].date + "</small></p>";
    $("#nl").innerHTML = html || "<p class=mut>No announcements yet.</p>";
  }
  drawNotes();
  $("#nf").onsubmit = function (e) {
    e.preventDefault();
    var text = getFormData(e.target).text.trim();
    if (!text) return;
    var notes = getNotes();
    notes.push({ text: text, date: today() });
    setData("hcm_notes", notes);
    e.target.reset();
    drawNotes();
  };
  startChat(user);
};

// ---------- employees.html ----------
pages.employees = function () {
  drawLayout("employees", "<h1>Employees</h1><section class=card><h2 id=ft>Add employee</h2>" +
    "<p class=mut>Employee ID: <b id=nid>" + nextEmployeeId() + "</b> (auto-generated)</p>" +
    '<form id=f novalidate class=grid><input type=hidden name=uid>' + field("name", "Full name") + field("email", "Email", "email") +
    field("password", "Password", "password") + field("department", "Department", "text", "list=dl") + field("salary", "Monthly salary", "number", "min=1") +
    '<datalist id=dl></datalist><div style="padding-bottom:20px"><button class=btn>Save</button> <button type=button class="btn ghost" id=rs>Reset</button></div></form></section>' +
    '<section class=card><div class=row><input id=q placeholder="Search name, email or ID" aria-label=Search><select id=df aria-label="Filter department"></select></div>' +
    "<div class=tw><table><thead><tr><th>ID<th>Name<th>Email<th>Dept<th>Salary<th></thead><tbody id=tb></tbody></table></div></section>");

  var form = $("#f");

  function drawTable() {
    var all = getEmployees(), depts = [], i;
    for (i = 0; i < all.length; i++) if (depts.indexOf(all[i].department) === -1) depts.push(all[i].department);
    var chosen = $("#df").value, options = '<option value="">All departments</option>', list = "";
    for (i = 0; i < depts.length; i++) {
      options += "<option" + (depts[i] === chosen ? " selected" : "") + ">" + escapeHtml(depts[i]) + "</option>";
      list += '<option value="' + escapeHtml(depts[i]) + '">';
    }
    $("#df").innerHTML = options;
    $("#dl").innerHTML = list;

    var search = $("#q").value.toLowerCase(), dept = $("#df").value, rows = "";
    for (i = 0; i < all.length; i++) {
      var x = all[i], text = (x.name + x.email + x.empId).toLowerCase();
      if ((dept && x.department !== dept) || text.indexOf(search) === -1) continue;
      rows += "<tr><td><b>" + x.empId + "</b><td>" + escapeHtml(x.name) + "<td>" + escapeHtml(x.email) + "<td>" + escapeHtml(x.department) +
        "<td>" + x.salary + '<td><button class="btn sm ghost" data-ed=' + x.id + '>Edit</button> <button class="btn sm bad" data-del=' + x.id + ">Delete</button>";
    }
    $("#tb").innerHTML = rows || "<tr><td colspan=6 class=mut>No employees found. Add one above.";
  }
  function resetForm() {
    form.reset();
    showErrors(form, {});
    $("#nid").textContent = nextEmployeeId();
    $("#ft").textContent = "Add employee";
  }

  form.onsubmit = function (e) {
    e.preventDefault();
    var v = getFormData(form), errors = {}, editId = Number(v.uid) || 0, users = getUsers(), i;
    if (!v.name.trim()) errors.name = "Name is required";
    if (!validEmail(v.email)) errors.email = "Enter a valid email";
    else {
      for (i = 0; i < users.length; i++) {
        if (users[i].email.toLowerCase() === v.email.toLowerCase() && users[i].id !== editId) errors.email = "Email already used";
      }
    }
    if (!editId && v.password.length < 4) errors.password = "Min 4 characters";
    if (!v.department.trim()) errors.department = "Department is required";
    if (!(Number(v.salary) > 0)) errors.salary = "Salary must be greater than 0";
    if (!showErrors(form, errors)) return;

    if (editId) {                                      // update
      for (i = 0; i < users.length; i++) {
        if (users[i].id === editId) {
          users[i].name = v.name.trim();
          users[i].email = v.email.trim();
          users[i].department = v.department.trim();
          users[i].salary = Number(v.salary);
          if (v.password) users[i].password = v.password;
        }
      }
    } else {                                           // add new (login is created here)
      users.push({ id: Date.now(), empId: nextEmployeeId(), name: v.name.trim(), email: v.email.trim(), password: v.password,
        role: "employee", department: v.department.trim(), salary: Number(v.salary), joined: today() });
    }
    setData("hcm_users", users);
    resetForm();
    drawTable();
    showToast(editId ? "Employee updated" : "Employee added, login created");
  };

  $("#tb").onclick = function (e) {
    var editId = e.target.getAttribute("data-ed"), delId = e.target.getAttribute("data-del"), users = getUsers(), i;
    if (editId) {
      for (i = 0; i < users.length; i++) {
        if (String(users[i].id) === editId) {
          var x = users[i];
          form.elements.name.value = x.name;
          form.elements.email.value = x.email;
          form.elements.department.value = x.department;
          form.elements.salary.value = x.salary;
          form.elements.password.value = "";
          form.elements.uid.value = x.id;
          $("#nid").textContent = x.empId;
          $("#ft").textContent = "Edit employee (leave password blank to keep it)";
          form.scrollIntoView({ behavior: "smooth" });
        }
      }
    }
    if (delId && confirm("Delete this employee and their records?")) {
      var keepUsers = [], keepAtt = [], keepLeaves = [], att = getAttendance(), lv = getLeaves();
      for (i = 0; i < users.length; i++) if (String(users[i].id) !== delId) keepUsers.push(users[i]);
      for (i = 0; i < att.length; i++) if (String(att[i].uid) !== delId) keepAtt.push(att[i]);
      for (i = 0; i < lv.length; i++) if (String(lv[i].uid) !== delId) keepLeaves.push(lv[i]);
      setData("hcm_users", keepUsers);
      setData("hcm_attendance", keepAtt);
      setData("hcm_leaves", keepLeaves);
      drawTable();
    }
  };
  $("#rs").onclick = resetForm;
  $("#q").oninput = drawTable;
  $("#df").onchange = drawTable;
  drawTable();
};

// ---------- leaves.html ----------
pages.leaves = function () {
  drawLayout("leaves", "<h1>Leave requests</h1><section class=card><div class=tw><table><thead><tr><th>Employee<th>Type<th>Dates<th>Days<th>Reason<th>Status<th></thead><tbody id=tb></tbody></table></div></section>");

  function drawLeaves() {
    var leaves = getLeaves(), rows = "";
    for (var i = leaves.length - 1; i >= 0; i--) {                 // newest first
      var l = leaves[i];
      rows += "<tr><td>" + escapeHtml(nameOf(l.uid)) + "<td>" + l.type + "<td>" + l.from + " → " + l.to + "<td>" + l.days + "<td>" + escapeHtml(l.reason) +
        '<td><span class="b ' + l.status + '">' + l.status + "</span>" + (l.comment ? "<br><small>" + escapeHtml(l.comment) + "</small>" : "") + "<td>";
      if (l.status === "pending") {
        rows += '<button class="btn sm ok" data-a=approved data-i=' + l.id + '>Approve</button> <button class="btn sm bad" data-a=rejected data-i=' + l.id + ">Reject</button>";
      }
    }
    $("#tb").innerHTML = rows || "<tr><td colspan=7 class=mut>No leave requests yet.";
  }
  $("#tb").onclick = function (e) {
    var action = e.target.getAttribute("data-a"), id = e.target.getAttribute("data-i");
    if (!action) return;
    var comment = prompt("Comment (optional):") || "", leaves = getLeaves();
    for (var i = 0; i < leaves.length; i++) {
      if (String(leaves[i].id) === id) { leaves[i].status = action; leaves[i].comment = comment; }
    }
    setData("hcm_leaves", leaves);
    drawLeaves();
    showToast("Leave " + action);
  };
  drawLeaves();
};

// ---------- settings.html ----------
pages.settings = function () {
  var c = getCompany(), dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], boxes = "";
  var days = c.days || [1, 2, 3, 4, 5];
  for (var i = 0; i < 7; i++) {
    boxes += "<label><input type=checkbox name=days value=" + i + ' style="width:auto"' + (days.indexOf(i) !== -1 ? " checked" : "") + "> " + dayNames[i] + "</label>";
  }
  drawLayout("settings", "<h1>Company settings</h1><section class=card><form id=f novalidate class=grid>" +
    field("cname", "Company name") + field("startTime", "Office start time", "time") + field("cutoff", "Last check-in time", "time") + field("grace", "Grace minutes", "number", "min=0") +
    field("leaveQuota", "Yearly leave quota (days)", "number", "min=0") +
    '<fieldset class=f style="border:0;grid-column:1/-1">Working days<div class=row>' + boxes + "</div><small data-e=days></small></fieldset>" +
    "<div><button class=btn>Save settings</button></div></form></section>" + passwordCard);

  var form = $("#f");
  form.elements.cname.value = c.name;
  form.elements.startTime.value = c.startTime;
  form.elements.cutoff.value = c.cutoff || "12:00";
  form.elements.grace.value = c.grace;
  form.elements.leaveQuota.value = c.leaveQuota;

  form.onsubmit = function (e) {
    e.preventDefault();
    var errors = {}, picked = [], checks = $$("[name=days]", form);
    for (var j = 0; j < checks.length; j++) if (checks[j].checked) picked.push(Number(checks[j].value));
    var el = form.elements;
    if (!el.cname.value.trim()) errors.cname = "Company name is required";
    if (!el.startTime.value) errors.startTime = "Start time is required";
    if (!el.cutoff.value) errors.cutoff = "Last check-in time is required";
    else if (el.startTime.value && toMinutes(el.cutoff.value) <= toMinutes(el.startTime.value)) errors.cutoff = "Must be after start time";
    if (el.grace.value === "" || Number(el.grace.value) < 0) errors.grace = "Enter 0 or more";
    if (el.leaveQuota.value === "" || Number(el.leaveQuota.value) < 0) errors.leaveQuota = "Enter 0 or more";
    if (!picked.length) errors.days = "Pick at least one working day";
    if (!showErrors(form, errors)) return;
    setData("hcm_company", { name: el.cname.value.trim(), startTime: el.startTime.value, cutoff: el.cutoff.value, grace: Number(el.grace.value),
      leaveQuota: Number(el.leaveQuota.value), days: picked });
    showToast("Settings saved");
  };
  startPasswordForm(currentUser());
};

// ---------- employee.html ----------
pages.employee = function () {
  var user = currentUser(), c = getCompany(), d = today(), all = getAttendance(), mine = [], monthCount = 0, lateCount = 0, i;
  for (i = 0; i < all.length; i++) {
    if (all[i].uid !== user.id) continue;
    mine.push(all[i]);
    if (all[i].date.slice(0, 7) === d.slice(0, 7)) monthCount++;
    if (all[i].late) lateCount++;
  }
  mine.sort(function (a, b) { return b.date.localeCompare(a.date); });
  var attRows = "";
  for (i = 0; i < mine.length && i < 10; i++) {
    attRows += "<tr><td>" + mine[i].date + "<td>" + mine[i].in + "<td>" + (mine[i].out || "-") + '<td><span class="b ' + mine[i].status + '">' + mine[i].status + "</span>";
  }
  var leaves = getLeaves(), leaveRows = "";
  for (i = leaves.length - 1; i >= 0; i--) {
    if (leaves[i].uid === user.id) {
      leaveRows += "<tr><td>" + leaves[i].from + " → " + leaves[i].to + "<td>" + leaves[i].days + '<td><span class="b ' + leaves[i].status + '">' + leaves[i].status +
        "</span> <small>" + escapeHtml(leaves[i].comment || "") + "</small>";
    }
  }
  var notes = getNotes().slice(-5).reverse(), noteHtml = "";
  for (i = 0; i < notes.length; i++) noteHtml += "<p>• " + escapeHtml(notes[i].text) + " <small>" + notes[i].date + "</small></p>";

  drawLayout("employee", "<h1>Hello, " + escapeHtml(user.name) + " 👋</h1><div class=stats>" +
    "<div class=card><b>" + (c.leaveQuota - leaveDaysUsed(user.id, ["approved"])) + "</b>Leave days left</div>" +
    "<div class=card><b>" + monthCount + "</b>Days present (month)</div><div class=card><b>" + lateCount + "</b>Late days</div></div>" +
    "<section class=card><h2>⏱️ Today · " + d + '</h2><p class=mut id=ts></p><div class=row style="margin-top:12px"><button class="btn ok" id=ci>Check in</button><button class="btn bad" id=co>Check out</button></div></section>' +
    "<section class=card><h2>My attendance</h2><div class=tw><table><thead><tr><th>Date<th>In<th>Out<th>Status</thead><tbody>" + (attRows || "<tr><td colspan=4 class=mut>No records yet.") + "</tbody></table></div></section>" +
    "<section class=card><h2>🗓️ Apply for leave</h2><form id=lf novalidate class=grid><label class=f>Type<select name=type><option>Casual<option>Sick<option>Annual</select><small></small></label>" +
    field("from", "From", "date") + field("to", "To", "date") + field("reason", "Reason") +
    '<div style="padding-bottom:20px"><button class=btn>Apply</button></div></form><div class=tw><table><thead><tr><th>Dates<th>Days<th>Status</thead><tbody>' +
    (leaveRows || "<tr><td colspan=3 class=mut>No leave requests.") + "</tbody></table></div></section>" +
    "<section class=card><h2>📢 Announcements</h2>" + (noteHtml || "<p class=mut>Nothing new.</p>") + "</section>" + chatHTML + passwordCard);

  var record = null;
  for (i = 0; i < all.length; i++) if (all[i].uid === user.id && all[i].date === d) record = all[i];
  var cutoff = c.cutoff || "12:00";
  var closed = !record && isWorkingDay(new Date()) && toMinutes(nowTime()) > toMinutes(cutoff);
  $("#ts").textContent = record ? "In: " + record.in + (record.out ? " · Out: " + record.out : "") + " · " + record.status
    : closed ? "Check-in closed (after " + cutoff + "). You are marked absent today."
    : "Not checked in yet. Check in before " + cutoff + ".";
  $("#ci").disabled = !!record || closed;
  $("#co").disabled = !record || !!record.out;

  $("#ci").onclick = function () {
    if (!isWorkingDay(new Date())) { showToast("Today is not a working day"); return; }
    if (toMinutes(nowTime()) > toMinutes(cutoff)) { showToast("Check-in closed after " + cutoff + ". Marked absent."); return; }
    var t = nowTime(), isLate = toMinutes(t) > toMinutes(c.startTime) + c.grace, list = getAttendance();
    list.push({ uid: user.id, date: d, in: t, out: "", late: isLate, status: isLate ? "late" : "present" });
    setData("hcm_attendance", list);
    location.reload();
  };
  $("#co").onclick = function () {
    var t = nowTime(), hours = (toMinutes(t) - toMinutes(record.in)) / 60, list = getAttendance();
    for (var j = 0; j < list.length; j++) {
      if (list[j].uid === user.id && list[j].date === d) {
        list[j].out = t;
        if (hours < 5) list[j].status = "half";        // under 5 hours = half day
      }
    }
    setData("hcm_attendance", list);
    location.reload();
  };

  $("#lf").onsubmit = function (e) {
    e.preventDefault();
    var form = e.target, v = getFormData(form), errors = {}, days = 0, list = getLeaves(), j;
    if (!v.from) errors.from = "Required";
    if (!v.to) errors.to = "Required";
    if (!v.reason.trim()) errors.reason = "Required";
    if (v.from && v.to) {
      if (v.from > v.to) errors.from = "From must be on or before To";
      else {
        days = countWorkDays(v.from, v.to);
        var overlap = false;
        for (j = 0; j < list.length; j++) {
          if (list[j].uid === user.id && list[j].status !== "rejected" && list[j].from <= v.to && list[j].to >= v.from) overlap = true;
        }
        var left = c.leaveQuota - leaveDaysUsed(user.id, ["approved", "pending"]);
        if (days === 0) errors.to = "No working days in this range";
        else if (overlap) errors.from = "Overlaps another leave";
        else if (days > left) errors.to = "Over quota: you asked for " + days + " working days, only " + left + " left";
      }
    }
    if (!showErrors(form, errors)) return;
    list.push({ id: Date.now(), uid: user.id, type: v.type, from: v.from, to: v.to, days: days, reason: v.reason.trim(), status: "pending", comment: "" });
    setData("hcm_leaves", list);
    location.reload();
  };
  startChat(user);
  startPasswordForm(user);
};

// ---------- payslip.html ----------
function getPayments() { return getData("hcm_payments", []); }
function findPayment(uid, month) {
  var list = getPayments();
  for (var i = 0; i < list.length; i++) if (list[i].uid === uid && list[i].month === month) return list[i];
  return null;
}
// Works out the salary slip numbers for one employee and one month (format "2026-10")
function calcSlip(emp, month) {
  var parts = month.split("-"), year = Number(parts[0]), mon = Number(parts[1]);
  var lastDay = new Date(year, mon, 0), todayStr = today(), att = getAttendance(), leaves = getLeaves();
  var workDays = 0, absent = 0, half = 0, j;
  for (var d = new Date(year, mon - 1, 1); d <= lastDay; d.setDate(d.getDate() + 1)) {
    if (!isWorkingDay(d)) continue;
    workDays++;
    var s = dateToString(d);
    if (s >= todayStr || s < emp.joined) continue;            // only past days since joining
    var rec = null, onLeave = false;
    for (j = 0; j < att.length; j++) if (att[j].uid === emp.id && att[j].date === s) rec = att[j];
    for (j = 0; j < leaves.length; j++) {
      if (leaves[j].uid === emp.id && leaves[j].status === "approved" && leaves[j].from <= s && leaves[j].to >= s) onLeave = true;
    }
    if (rec) { if (rec.status === "half") half++; }
    else if (!onLeave) absent++;
  }
  var perDay = workDays ? emp.salary / workDays : 0;
  var deduction = perDay * (absent + 0.5 * half);
  return { salary: emp.salary, workDays: workDays, absent: absent, half: half, perDay: perDay, deduction: deduction, net: emp.salary - deduction };
}

pages.payslip = function () {
  var user = currentUser(), isAdmin = user.role === "admin", staff = getEmployees(), picker = "", i;
  if (isAdmin) {
    picker = "<select id=eu aria-label=Employee>";
    for (i = 0; i < staff.length; i++) picker += "<option value=" + staff[i].id + ">" + escapeHtml(staff[i].name) + " (" + staff[i].empId + ")</option>";
    picker += "</select>";
  }
  drawLayout("payslip", '<h1>Payslip</h1><section class="card noprint"><div class=row>' + picker + '<input type=month id=mo value="' + today().slice(0, 7) +
    '" aria-label=Month><button class=btn id=pr style="flex:0">Print / PDF</button></div></section><section class="card slip" id=sl></section>');

  function drawSlip() {
    var emp = user, month = $("#mo").value, j;
    if (isAdmin) {
      emp = null;
      for (j = 0; j < staff.length; j++) if (String(staff[j].id) === $("#eu").value) emp = staff[j];
    }
    if (!emp || !month) { $("#sl").innerHTML = "<p class=mut>Add an employee first.</p>"; return; }

    var paid = findPayment(emp.id, month);                    // saved when Admin pays
    if (!isAdmin && !paid) {                                  // employee sees nothing until paid
      $("#sl").innerHTML = "<h2>Payslip · " + month + "</h2><p class=mut>Your payslip for this month is not ready yet. It appears here after the Admin pays your salary.</p>";
      $("#pr").disabled = true;
      return;
    }
    $("#pr").disabled = false;
    var slip = paid || calcSlip(emp, month);
    function row(label, value) { return "<tr><td>" + label + '<td style="text-align:right">' + value; }
    var status = paid ? '<span class="b approved">Paid on ' + paid.paidOn + "</span>" : '<span class="b pending">Not paid yet</span>';
    $("#sl").innerHTML = "<h2>" + escapeHtml(getCompany().name) + " · " + month + "</h2><p class=mut>" + escapeHtml(emp.name) + " · " + emp.empId + " · " + escapeHtml(emp.department) +
      "</p><p>" + status + "</p><div class=tw><table><tbody>" + row("Monthly salary", slip.salary.toFixed(2)) + row("Working days", slip.workDays) + row("Per day", slip.perDay.toFixed(2)) +
      row("Absent days", slip.absent) + row("Half days", slip.half) + row("Deduction", slip.deduction.toFixed(2)) +
      row("<b>Net salary</b>", '<span class=tot>' + slip.net.toFixed(2) + "</span>") + "</tbody></table></div>" +
      (isAdmin && !paid ? '<p class=noprint style="margin-top:16px"><button class="btn ok" id=pay>💸 Pay salary</button></p>' : "");

    if (isAdmin && !paid) {
      $("#pay").onclick = function () {
        if (!confirm("Pay " + slip.net.toFixed(2) + " to " + emp.name + " for " + month + "?")) return;
        var list = getPayments();
        list.push({ uid: emp.id, month: month, salary: slip.salary, workDays: slip.workDays, absent: slip.absent, half: slip.half,
          perDay: slip.perDay, deduction: slip.deduction, net: slip.net, paidOn: today() });
        setData("hcm_payments", list);
        showToast("Salary paid. Payslip is now visible to " + emp.name);
        drawSlip();
      };
    }
  }
  $("#mo").onchange = drawSlip;
  if (isAdmin) $("#eu").onchange = drawSlip;
  $("#pr").onclick = function () { window.print(); };
  drawSlip();
};

// =====================================================
// START
// =====================================================
function startApp() {
  if (isIndex) { pages.index(); return; }
  var user = currentUser(), adminPages = ["admin", "employees", "leaves", "settings"];
  if (!user || !getCompany()) { location = ROOT + "index.html"; return; }
  if (adminPages.indexOf(pageName) !== -1 && user.role !== "admin") { location = goHome(user); return; }
  if (pageName === "employee" && user.role !== "employee") { location = goHome(user); return; }
  if (pages[pageName]) pages[pageName]();
  else $("#app").innerHTML = "<p style='padding:20px'>Unknown page: " + escapeHtml(pageName) + "</p>";
}
startApp();