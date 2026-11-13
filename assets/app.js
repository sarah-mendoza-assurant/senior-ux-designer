/* Senior UX Designer assessment.
   Baseline content comes from /data/*.json. Edits (ratings, evidence text and links, evidence entries,
   comments) are saved to a shared Firestore database through its REST API. Anyone with the link can edit. */
(function () {
  "use strict";

  const FB = {
    project: "senior-ux-assessment",
    key: "AIzaSyAxm1NdeqKfZBM2450VW8HQiEqEoTg_XmE", // public web identifier, not a secret
  };
  const FS = `https://firestore.googleapis.com/v1/projects/${FB.project}/databases/(default)/documents/site`;

  const VERIF = {
    "source-document": ["src", "Backed by source document"],
    "brief-only": ["brief", "From brief, needs source"],
    estimate: ["est", "Estimate, not measured"],
  };
  const TYPES = ["Case study", "Research / validation", "Design artifact", "Collaboration", "Analytics", "Training", "Process", "Other"];
  const S = { data: null, online: false, fs: { a: {}, e: {}, c: [], overall: null }, ui: { ev: {}, cmtOpen: {}, cmtEdit: null, evForm: null, ov: null } };

  // ---------- helpers ----------
  const esc = (s) =>
    String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  class Raw { constructor(s) { this.s = s; } }
  const raw = (s) => new Raw(s);
  const html = (strings, ...vals) =>
    new Raw(
      strings.reduce((out, str, i) => {
        let v = vals[i - 1];
        if (Array.isArray(v)) v = v.map((x) => (x instanceof Raw ? x.s : esc(x))).join("");
        else if (v instanceof Raw) v = v.s;
        else v = esc(v);
        return out + v + str;
      })
    );
  const safeUrl = (u) => (/^https?:\/\//i.test((u || "").trim()) ? u.trim() : null);
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const cut = (t, n) => (t.length > n ? t.slice(0, n - 2) + "…" : t);
  const $ = (sel, root = document) => root.querySelector(sel);
  const store = {
    get: (k) => { try { return localStorage.getItem(k) || ""; } catch (e) { return ""; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } },
  };

  // ---------- Firestore REST ----------
  const enc = (v) =>
    typeof v === "boolean" ? { booleanValue: v }
    : Array.isArray(v) ? { arrayValue: { values: v.map(enc) } }
    : v && typeof v === "object" ? { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enc(x)])) } }
    : { stringValue: v == null ? "" : String(v) };
  const dec = (f) =>
    "stringValue" in f ? f.stringValue
    : "booleanValue" in f ? f.booleanValue
    : "integerValue" in f ? Number(f.integerValue)
    : "arrayValue" in f ? (f.arrayValue.values || []).map(dec)
    : "mapValue" in f ? Object.fromEntries(Object.entries(f.mapValue.fields || {}).map(([k, x]) => [k, dec(x)]))
    : null;

  async function fsList() {
    const docs = [];
    let tok = "";
    do {
      const r = await fetch(`${FS}?pageSize=300&key=${FB.key}${tok ? `&pageToken=${encodeURIComponent(tok)}` : ""}`);
      if (!r.ok) throw new Error(`Database read failed (${r.status})`);
      const j = await r.json();
      docs.push(...(j.documents || []));
      tok = j.nextPageToken || "";
    } while (tok);
    return docs.map((d) => ({ id: d.name.split("/").pop(), updated: d.updateTime || "", fields: Object.fromEntries(Object.entries(d.fields || {}).map(([k, v]) => [k, dec(v)])) }));
  }
  async function fsSet(id, fields, mask) {
    const q = (mask || []).map((m) => `updateMask.fieldPaths=${encodeURIComponent(m)}`).join("&");
    const r = await fetch(`${FS}/${encodeURIComponent(id)}?${q}${q ? "&" : ""}key=${FB.key}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, enc(v)])) }),
    });
    if (!r.ok) throw new Error(`Save failed (${r.status})`);
  }
  async function fsDel(id) {
    const r = await fetch(`${FS}/${encodeURIComponent(id)}?key=${FB.key}`, { method: "DELETE" });
    if (!r.ok) throw new Error(`Delete failed (${r.status})`);
  }

  // "Updated" = the last time anything was edited on the site (latest database change), else the baseline date.
  const pad2 = (n) => String(n).padStart(2, "0");
  const fmtDate = (s) => { // always MM/DD/YYYY
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (m) return `${m[2]}/${m[3]}/${m[1]}`;
    const d = new Date(s);
    return isNaN(d) ? s : `${pad2(d.getMonth() + 1)}/${pad2(d.getDate())}/${d.getFullYear()}`;
  };
  const fmtEvDate = (s) => (/^\d{4}-\d{2}$/.test(s || "") ? `${s.slice(5)}/${s.slice(0, 4)}` : fmtDate(s)); // month-only dates stay MM/YYYY
  const updatedText = () => fmtDate(S.fs.updated || (S.data && S.data.overview.updated) || "");
  let toastTimer;
  function toast(msg, bad) {
    const t = $("#toast");
    t.textContent = msg;
    t.className = "show" + (bad ? " bad" : "");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.className = ""; }, bad ? 6000 : 2200);
  }
  async function save(promise, okMsg) {
    toast("Saving…");
    try {
      await promise; toast(okMsg || "Saved");
      S.fs.updated = new Date().toISOString();
      const el = $("#updated-at"); if (el) el.textContent = updatedText();
      return true;
    }
    catch (err) { toast(err.message + ". Your change was not saved.", true); return false; }
  }

  // ---------- data ----------
  async function load() {
    const names = ["criteria", "assessments", "evidence", "projects", "overview"];
    const res = await Promise.all(names.map((n) => fetch(`data/${n}.json`, { cache: "no-cache" }).then((r) => {
      if (!r.ok) throw new Error(`Could not load data/${n}.json`);
      return r.json();
    })));
    const [criteria, assessments, evidence, projects, overview] = res;
    const all = [];
    criteria.categories.forEach((cat) => cat.criteria.forEach((c) => all.push({ ...c, catId: cat.id, catName: cat.name })));
    S.data = {
      criteria, all, overview,
      levels: criteria.masteryScale,
      byId: Object.fromEntries(all.map((c) => [c.id, c])),
      projById: Object.fromEntries(projects.projects.map((p) => [p.id, p])),
      assessments: assessments.assessments,
      seedEvidence: evidence.evidence,
      projects: projects.projects,
    };
    try {
      const docs = await fsList();
      S.fs.updated = docs.reduce((m, d) => (d.updated > m ? d.updated : m), "");
      docs.forEach(({ id, fields }) => {
        if (id.startsWith("a_")) S.fs.a[id.slice(2)] = fields;
        else if (id.startsWith("e_")) S.fs.e[id.slice(2)] = fields;
        else if (id.startsWith("c_")) S.fs.c.push({ id, ...fields });
        else if (id === "overall") S.fs.overall = fields;
      });
      S.online = true;
    } catch (err) { S.online = false; }
  }

  const asmt = (cid) => S.data.assessments[cid];
  const projName = (id) => (id && S.data.projById[id] ? S.data.projById[id].name : "Other contributions");

  function allEvidence() {
    const items = S.data.seedEvidence.map((e) => {
      const o = S.fs.e[e.id];
      if (!o) return e;
      if (o.deleted) return null;
      return { ...e, title: o.title ?? e.title, type: o.type ?? e.type, project: o.project === undefined ? e.project : o.project || null,
        contribution: o.contribution ?? e.contribution, outcome: o.outcome ?? e.outcome,
        source: { ...e.source, label: o.sourceLabel ?? e.source.label, url: o.sourceUrl === undefined ? e.source.url : o.sourceUrl || null } };
    }).filter(Boolean);
    const seen = new Set(S.data.seedEvidence.map((e) => e.id));
    Object.entries(S.fs.e).forEach(([id, o]) => {
      if (seen.has(id) || !o.custom) return;
      items.push({ id, custom: true, title: o.title || "(untitled)", type: o.type || "Other", project: o.project || null,
        contribution: o.contribution || "", outcome: o.outcome || "", created: o.created || "",
        source: { label: o.sourceLabel || "", pages: "", url: o.sourceUrl || null }, criteria: [] });
    });
    return items;
  }
  const evById = (id) => allEvidence().find((e) => e.id === id);
  const evidenceFor = (cid) => allEvidence().filter((e) => (e.criteria || []).includes(cid));
  const evidenceByProject = (pid) => allEvidence().filter((e) => (e.project || null) === pid);
  const sourcedCount = (cid) => evidenceFor(cid).filter((e) => e.verification && e.verification.level === "source-document").length;

  const ratingOf = (cid) => (S.fs.a[cid] && S.fs.a[cid].rating !== undefined ? S.fs.a[cid].rating : asmt(cid).rating) || "";
  const evTextOf = (cid) => (S.fs.a[cid] && S.fs.a[cid].evidenceText !== undefined ? S.fs.a[cid].evidenceText : asmt(cid).evidenceSummary) || "";
  const evLinksOf = (cid) => {
    if (S.fs.a[cid] && Array.isArray(S.fs.a[cid].evidenceLinks)) return S.fs.a[cid].evidenceLinks;
    const own = asmt(cid).links || [];
    return [...own.map((l) => ({ t: "url", label: l.label, url: l.url, id: "" })), ...evidenceFor(cid).map((e) => ({ t: "evidence", id: e.id, label: "", url: "" }))];
  };
  const hasEvidence = (cid) => !!(evTextOf(cid).trim() || evLinksOf(cid).some((l) => l.t === "url" || evById(l.id)));
  const commentsFor = (cid) => S.fs.c.filter((c) => c.cid === cid).sort((a, b) => (a.created || "").localeCompare(b.created || ""));
  const levelFromText = (t) => (t ? S.data.levels.find((l) => l.level.toLowerCase() === t.trim().toLowerCase()) : null);
  const lvlCls = (name) => "lvl-" + String(name).toLowerCase();

  // ---------- shared pieces ----------
  const ICON_EDIT = raw('<svg class="ico" viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" focusable="false"><path d="M11.3 1.7a1.5 1.5 0 0 1 2.1 0l.9.9a1.5 1.5 0 0 1 0 2.1l-8 8-3.4.8a.5.5 0 0 1-.6-.6l.8-3.4 8.2-7.8Zm1.4.7a.5.5 0 0 0-.7 0L10.9 3.5l1.6 1.6 1.1-1.1a.5.5 0 0 0 0-.7l-.9-.9ZM11.8 5.8 10.2 4.2 4 10.2l-.5 2.3 2.3-.5 6-6.2Z" fill="currentColor"/></svg>');
  const levelPill = (name) => html`<span class="lvl-pill ${lvlCls(name)}">${name}</span>`;
  const verifTag = (v) => (v ? html`<span class="tag ${VERIF[v.level][0]}">${VERIF[v.level][1]}</span>` : "");

  function ratingCell(c) {
    const cur = ratingOf(c.id);
    const label = cur ? levelPill(cur) : html`<span class="lvl-pill lvl-none">Not assessed</span>`;
    const prior = c.priorRating ? html`<span class="prior">Prior year: ${c.priorRating}</span>` : "";
    if (!S.online) return html`${label}${prior}`;
    const chevPill = html`<span class="lvl-pill ${cur ? lvlCls(cur) : "lvl-none"}">${cur || "Not assessed"}<span class="chev" aria-hidden="true">▾</span></span>`;
    return html`<div class="lvl">
      <button type="button" class="lvl-btn" data-act="lvl-toggle" aria-haspopup="listbox" aria-expanded="false" aria-label="My assessment for ${c.title}: ${cur || "Not assessed"}">${chevPill}</button>
      <div class="lvl-menu" role="listbox" hidden>
        <button type="button" role="option" class="lvl-opt" data-act="lvl-pick" data-cid="${c.id}" data-v=""><span class="lvl-pill lvl-none">Not assessed</span><span class="lvl-key">No rating yet</span></button>
        ${S.data.levels.map((l) => html`<button type="button" role="option" class="lvl-opt" data-act="lvl-pick" data-cid="${c.id}" data-v="${l.level}" aria-selected="${cur === l.level}"><span class="lvl-pill ${lvlCls(l.level)}">${l.level}</span><span class="lvl-key">${l.meaning}</span></button>`)}
      </div>
    </div>${prior}`;
  }

  const wordCut = (t, n = 10) => { const w = String(t).trim().split(/\s+/); return w.length > n ? w.slice(0, n).join(" ") + "…" : w.join(" "); };
  function linkItem(l, edit) {
    const open = edit === true ? "" : " ↗";
    if (l.t === "url") {
      const u = safeUrl(l.url);
      if (!u) return html`<span class="plain">${wordCut(l.label || "")}</span>`;
      const full = l.label || u;
      return edit === true ? html`<span class="chipl" title="${full}">${wordCut(full)}</span>`
        : html`<a class="chipl" href="${u}" target="_blank" rel="noopener noreferrer" title="${full}">${wordCut(full)}${open}</a>`;
    }
    const ev = evById(l.id);
    if (!ev) return "";
    const full = l.label || ev.title;
    return edit === true ? html`<span class="chipl" title="${full}">${wordCut(full)}</span>`
      : html`<a class="chipl" href="#/evidence/${ev.id}" target="_blank" rel="noopener" title="${full}">${wordCut(full)}${open}</a>`;
  }

  function evidenceCell(c) {
    const cid = c.id;
    const d = S.ui.ev[cid];
    if (d) {
      const evOpts = allEvidence().map((e) => html`<option value="${e.id}">${cut(e.title, 70)}</option>`);
      return html`<div class="ev-edit">
        <label class="fld" for="ta-${cid}"><span>Supporting evidence</span></label>
        <textarea id="ta-${cid}" class="ta" rows="5" data-draft data-cid="${cid}" placeholder="How does this work demonstrate the requirement? 1-3 sentences.">${d.text}</textarea>
        <ul class="ev-links editing">${d.links.map((l, i) => html`<li>${linkItem(l, true)}<button type="button" class="x" data-act="ev-rm" data-cid="${cid}" data-i="${i}" aria-label="Remove link">×</button></li>`)}</ul>
        <div class="field-row"><label class="fld grow"><span>Link to an evidence entry</span><select class="in" data-pick="${cid}"><option value="">Choose an entry…</option>${evOpts}</select></label>
          <label class="fld grow"><span>Link title (optional)</span><input class="in" data-etitle="${cid}" placeholder="Title"></label>
          <button type="button" class="mini" data-act="ev-add-ev" data-cid="${cid}">Add</button></div>
        <div class="field-row"><label class="fld grow"><span>Link title</span><input class="in" data-lbl="${cid}" placeholder="Title"></label>
          <label class="fld grow"><span>Link address</span><input class="in" data-url="${cid}" placeholder="https://…"></label>
          <button type="button" class="mini" data-act="ev-add-url" data-cid="${cid}">Add link</button></div>
        <div class="actions"><button type="button" class="btn sm" data-act="ev-save" data-cid="${cid}">Save</button>
          <button type="button" class="btn-ghost sm" data-act="ev-cancel" data-cid="${cid}">Cancel</button></div>
      </div>`;
    }
    const text = evTextOf(cid);
    const links = evLinksOf(cid).map(linkItem).filter((x) => x !== "");
    return html`${text ? html`<p class="ev-text">${text}</p>` : html`<p class="none-yet">No evidence added yet.</p>`}
      ${links.length ? html`<ul class="ev-links">${links.map((l) => html`<li>${l}</li>`)}</ul>` : ""}
      ${S.online ? html`<div class="ev-foot"><button type="button" class="pill-btn" data-act="ev-edit" data-cid="${cid}" aria-label="Edit supporting evidence for ${c.title}">${ICON_EDIT}Edit</button></div>` : ""}`;
  }

  function commentRow(c) {
    const cid = c.id, list = commentsFor(cid);
    const item = (m) => {
      if (S.ui.cmtEdit === m.id) return commentForm(cid, m);
      return html`<div class="cmt"><div class="cmt-meta">${m.name ? html`<strong>${m.name}</strong>` : ""}${m.created ? html`${m.name ? " · " : ""}${fmtDate(m.created)}` : ""}
        ${S.online ? html`<button type="button" class="mini icon-btn" data-act="cmt-edit" data-id="${m.id}" data-cid="${cid}" aria-label="Edit comment">${ICON_EDIT}Edit</button><button type="button" class="mini" data-act="cmt-del" data-id="${m.id}" data-cid="${cid}">Delete</button>` : ""}</div>
        <p>${m.text}</p></div>`;
    };
    const adding = S.ui.cmtOpen[cid] && !S.ui.cmtEdit;
    return html`<tr class="cmt-row"><td colspan="4"><div class="cmt-wrap" role="group" aria-label="Comments on ${c.title}">
      <div class="cmt-head"><span class="cmt-count">${list.length ? `Comments (${list.length})` : "No comments"}</span>
        ${S.online && !adding ? html`<button type="button" class="mini cmt-add" data-act="cmt-add" data-cid="${cid}">+ Add comment</button>` : ""}</div>
      ${list.length ? html`<div class="cmt-list">${list.map(item)}</div>` : ""}
      ${adding ? commentForm(cid, null) : ""}</div></td></tr>`;
  }
  function commentForm(cid, m) {
    return html`<div class="cmt-form">
      <label class="fld"><span>Title</span><input class="in" data-cname placeholder="Title" value="${m ? m.name || "" : ""}"></label>
      <label class="fld"><span>Comment</span><textarea class="ta" rows="3" data-ctext placeholder="Add a comment">${m ? m.text : ""}</textarea></label>
      <div class="actions"><button type="button" class="btn sm" data-act="cmt-save" data-cid="${cid}" data-id="${m ? m.id : ""}">Save</button>
        <button type="button" class="btn-ghost sm" data-act="cmt-cancel" data-cid="${cid}">Cancel</button></div></div>`;
  }

  function rowGroup(c) {
    const cid = c.id, sr = levelFromText(c.srUxd);
    const cm = commentRow(c);
    return html`<tbody data-cid="${cid}" class="has-cmt">
      <tr class="main-row">
        <td data-label="Requirement"><a class="req-title" href="#/criteria/${cid}">${c.title}</a>${c.description ? html`<p class="req-desc">${c.description}</p>` : ""}</td>
        <td data-label="Senior UX Designer expectation">${sr ? levelPill(sr.level) : html`<p class="exp-text">${c.srUxd}</p>`}</td>
        <td data-label="My assessment">${ratingCell(c)}</td>
        <td data-label="Supporting evidence">${evidenceCell(c)}</td>
      </tr>${cm}</tbody>`;
  }
  function refreshRow(cid) {
    const old = $(`tbody[data-cid="${cid}"]`);
    if (old) old.outerHTML = rowGroup(S.data.byId[cid]).s;
  }

  function assessmentTable(cat) {
    return html`<table class="assessment">
      <colgroup><col class="c1"><col class="c2"><col class="c3"><col class="c4"></colgroup>
      <thead><tr><th scope="col">Requirement</th><th scope="col">Senior UX Designer<br>Expectation</th><th scope="col">My assessment</th><th scope="col">Supporting evidence</th></tr></thead>
      ${cat.criteria.map((c) => rowGroup({ ...c, catId: cat.id, catName: cat.name }))}
    </table>`;
  }

  function sidebar(activeCat) {
    return html`<aside class="sidebar" aria-label="Activity">
      <h2>Activity</h2>
      <p class="sub">From Senior UX Designer Workbook</p>
      <ul>${S.data.criteria.categories.map((cat) => html`<li class="cat"><a href="#/assessment/${cat.id}" ${
        cat.id === activeCat ? raw('aria-current="page"') : ""}><span>${cat.name}</span><span class="count">${cat.criteria.length}</span></a></li>`)}</ul>
    </aside>`;
  }
  const withSidebar = (activeCat, content) => html`<div class="layout">${sidebar(activeCat)}<section class="content">${content}</section></div>`;

  function evidenceBlock(e, opts = {}) {
    const others = (e.criteria || []);
    const editing = S.ui.evForm === e.id;
    if (editing) return html`<div id="evi-${e.id}">${evidenceForm(e)}</div>`;
    return html`<article class="block ev" id="evi-${e.id}">
      <div class="chips"><span class="tag">${e.type}</span>${verifTag(e.verification)}${e.date ? html`<span class="tag">${fmtEvDate(e.date)}</span>` : ""}</div>
      <h3>${e.title}</h3>
      <dl>
        <dt>Project</dt><dd>${projName(e.project)}</dd>
        ${e.contribution ? html`<dt>What I did</dt><dd class="verbatim">${e.contribution}</dd>` : ""}
        ${e.outcome ? html`<dt>Outcome / impact</dt><dd class="verbatim">${e.outcome}</dd>` : ""}
        ${e.source && (e.source.label || safeUrl(e.source.url)) ? html`<dt>Source</dt><dd>${e.source.label}${e.source.pages ? html` (${e.source.pages})` : ""}${
          safeUrl(e.source.url) ? html` <a href="${safeUrl(e.source.url)}" target="_blank" rel="noopener noreferrer">Open ↗</a>` : ""}</dd>` : ""}
        ${e.verification && e.verification.note ? html`<dt>Verification note</dt><dd>${e.verification.note}</dd>` : ""}
        ${others.length ? html`<dt>Also supports</dt><dd><span class="chips">${others.map((c) => html`<a class="chip" href="#/criteria/${c}">${cut(S.data.byId[c].title, 48)}</a>`)}</span></dd>` : ""}
      </dl>
      ${opts.editable && S.online ? html`<p class="actions"><button type="button" class="mini icon-btn" data-act="evn-edit" data-id="${e.id}" aria-label="Edit ${e.title}">${ICON_EDIT}Edit</button></p>` : ""}
    </article>`;
  }

  function evidenceForm(e) {
    const isNew = !e;
    const v = e || { title: "", type: "Other", project: null, contribution: "", outcome: "", source: { label: "", url: "" } };
    return html`<div class="evform" role="group" aria-label="${isNew ? "Add evidence" : "Edit evidence"}">
      <h3 style="margin-top:0">${isNew ? "Add evidence" : "Edit evidence"}</h3>
      <label>Title<input class="in" id="evf-title" value="${v.title}"></label>
      <div class="field-row two">
        <label>Type<select class="in" id="evf-type">${TYPES.map((t) => html`<option ${t === v.type ? raw("selected") : ""}>${t}</option>`)}</select></label>
        <label>Project<select class="in" id="evf-project"><option value="">Other contributions</option>${S.data.projects.map((p) => html`<option value="${p.id}" ${p.id === v.project ? raw("selected") : ""}>${p.name}</option>`)}</select></label>
      </div>
      <label>What I did<textarea class="ta" id="evf-contribution" rows="3">${v.contribution}</textarea></label>
      <label>Outcome / impact<textarea class="ta" id="evf-outcome" rows="3">${v.outcome}</textarea></label>
      <div class="field-row two">
        <label>Source name<input class="in" id="evf-srclabel" value="${v.source.label || ""}"></label>
        <label>Source link<input class="in" id="evf-srcurl" placeholder="https://…" value="${v.source.url || ""}"></label>
      </div>
      <div class="actions"><button type="button" class="btn sm" data-act="evn-save" data-id="${isNew ? "" : v.id}">Save</button>
        <button type="button" class="btn-ghost sm" data-act="evn-cancel">Cancel</button>
        ${isNew ? "" : html`<button type="button" class="btn-danger sm" data-act="evn-del" data-id="${v.id}">Delete evidence</button>`}</div>
    </div>`;
  }

  // ---------- views ----------
  function viewAssessment(catId) {
    const cat = S.data.criteria.categories.find((c) => c.id === catId) || S.data.criteria.categories[0];
    const o = S.data.overview;
    return withSidebar(cat.id, html`
      <div class="section-head">
        <h1 class="cat-h">${cat.name}</h1>
        <div class="meta"><span>${cat.criteria.length} requirements</span></div>
      </div>
      ${S.online ? "" : html`<p class="note">Saved edits couldn't be loaded, so you're seeing the original content and editing is off. Refresh to try again.</p>`}
      ${assessmentTable(cat)}`);
  }

  function viewEvidence(focusId) {
    const { overview: o, all, levels } = S.data;
    const counts = levels.map((l) => [l.level, all.filter((c) => ratingOf(c.id) === l.level).length]);
    const assessed = counts.reduce((n, [, k]) => n + k, 0);
    const items = allEvidence();
    const groups = [...S.data.projects.map((p) => [p.name, items.filter((e) => e.project === p.id)]), ["Other contributions", items.filter((e) => !e.project || !S.data.projById[e.project])]];
    return html`<div class="page">
      <p class="crumbs" style="margin-top:0"><a class="btn-back" href="#/assessment">← Back to assessment</a></p>
      <h1>Evidence</h1>
      <p class="lead">${o.summary}</p>
      <div class="stats">
        <div><div class="stat">${assessed}<span class="muted"> / ${all.length}</span></div><div class="stat-label">Requirements assessed</div></div>
        ${counts.map(([k, n]) => html`<div><div class="stat">${n}</div><div class="stat-label">${k}</div></div>`)}
        <div><div class="stat">${items.length}</div><div class="stat-label">Evidence entries</div></div>
      </div>
      ${S.online ? html`<p style="margin-top:20px">${S.ui.evForm === "new" ? "" : html`<button type="button" class="btn" data-act="evn-new">Add evidence</button>`}</p>` : html`<p class="note">Saved edits couldn't be loaded, so editing is off. Refresh to try again.</p>`}
      ${S.ui.evForm === "new" ? evidenceForm(null) : ""}
      <p class="muted">Each entry has its own anchor. On the Assessment page, use "Edit evidence" on a row to link to an entry; the link opens it here in a new tab.</p>
      ${groups.map(([name, list]) => list.length ? html`<h2>${name} (${list.length})</h2>${list.map((e) => evidenceBlock(e, { editable: true }))}` : "")}
    </div>`;
  }

  const ovSections = () => (S.fs.overall && Array.isArray(S.fs.overall.sections) ? S.fs.overall.sections : []);
  function ovLinks(links) {
    const items = (links || []).map((l) => linkItem(l)).filter((x) => x !== "");
    return items.length ? html`<ul class="ev-links">${items.map((l) => html`<li>${l}</li>`)}</ul>` : "";
  }
  function viewOverall() {
    const d = S.ui.ov;
    const head = html`<div class="ov-head"><h1 class="cat-h">Summary</h1>
      ${S.online && !d ? html`<button type="button" class="pill-btn" data-act="ov-edit">${ICON_EDIT}Edit</button>` : ""}</div>`;
    if (!d) {
      const secs = ovSections();
      return html`<div class="content ov">${head}
        ${S.online ? "" : html`<p class="note">Saved edits couldn't be loaded, so editing is off. Refresh to try again.</p>`}
        ${secs.length ? secs.map((x) => html`<section class="ov-sec">${x.title ? html`<h2>${x.title}</h2>` : ""}
          ${x.text ? html`<p class="ev-text">${x.text}</p>` : ""}${ovLinks(x.links)}</section>`)
          : html`<p class="none-yet">Nothing written yet. Use Edit to summarize strengths and what is brought to a senior position.</p>`}
      </div>`;
    }
    const evOpts = allEvidence().map((e) => html`<option value="${e.id}">${cut(e.title, 70)}</option>`);
    return html`<div class="content ov">${head}
      ${d.sections.map((x, i) => html`<div class="ov-edit">
        <div class="ov-tools"><span class="muted">Section ${i + 1}</span>
          <span><button type="button" class="mini" data-act="ov-up" data-i="${i}" ${i === 0 ? raw("disabled") : ""} aria-label="Move section up">↑</button>
          <button type="button" class="mini" data-act="ov-down" data-i="${i}" ${i === d.sections.length - 1 ? raw("disabled") : ""} aria-label="Move section down">↓</button>
          <button type="button" class="mini" data-act="ov-rm" data-i="${i}">Remove section</button></span></div>
        <label class="fld"><span>Section title (optional)</span><input class="in" data-ov="title" data-i="${i}" placeholder="Title" value="${x.title}"></label>
        <label class="fld"><span>Section text</span><textarea class="ta" rows="7" data-ov="text" data-i="${i}" placeholder="Write here. Press Enter for line breaks.">${x.text}</textarea></label>
        <ul class="ev-links editing">${x.links.map((l, j) => html`<li>${linkItem(l, true)}<button type="button" class="x" data-act="ov-rmlink" data-i="${i}" data-j="${j}" aria-label="Remove link">×</button></li>`)}</ul>
        <div class="field-row"><label class="fld grow"><span>Link to an evidence entry</span><select class="in" data-ovpick="${i}"><option value="">Choose an entry…</option>${evOpts}</select></label>
          <label class="fld grow"><span>Link title (optional)</span><input class="in" data-ovetitle="${i}" placeholder="Title"></label>
          <button type="button" class="mini" data-act="ov-addev" data-i="${i}">Add</button></div>
        <div class="field-row"><label class="fld grow"><span>Link title</span><input class="in" data-ovlbl="${i}" placeholder="Title"></label>
          <label class="fld grow"><span>Link address</span><input class="in" data-ovurl="${i}" placeholder="https://…"></label>
          <button type="button" class="mini" data-act="ov-addurl" data-i="${i}">Add link</button></div>
      </div>`)}
      <div class="actions"><button type="button" class="btn-ghost sm" data-act="ov-add">+ Add section</button></div>
      <div class="actions"><button type="button" class="btn sm" data-act="ov-save">Save</button>
        <button type="button" class="btn-ghost sm" data-act="ov-cancel">Cancel</button></div>
    </div>`;
  }

  function viewCriterion(id) {
    const c = S.data.byId[id];
    if (!c) return viewNotFound();
    const a = asmt(id), cur = ratingOf(id), ev = evidenceFor(id);
    const idx = S.data.all.findIndex((x) => x.id === id);
    const prev = S.data.all[idx - 1], next = S.data.all[idx + 1];
    const links = evLinksOf(id).map(linkItem).filter((x) => x !== "");
    return withSidebar(c.catId, html`
      <p class="crumbs" style="margin-top:0"><a href="#/assessment/${c.catId}">${c.catName}</a> › Requirement detail</p>
      <h1 style="font-size:1.8rem">${c.title}</h1>
      ${c.description ? html`<p class="lead verbatim">${c.description}</p>` : ""}
      <p class="muted">Workbook row ${c.sourceRow}. Wording is exactly as written in the workbook.</p>

      <h2>Official expectations</h2>
      <div class="two-col">
        <div class="exp-block"><h3>UXD expectation</h3><p class="val">${c.uxd || "Not specified in the workbook"}</p></div>
        <div class="exp-block sr"><h3>Sr UXD expectation</h3><p class="val">${levelFromText(c.srUxd) ? levelPill(c.srUxd.trim()) : c.srUxd}</p></div>
      </div>

      <h2>Prior-year information</h2>
      <div class="prior-box">
        <p class="label">Recorded approximately one year ago. Not the current assessment.</p>
        <p style="margin:0 0 4px"><strong>Self-rating:</strong> ${c.priorRating || html`<span class="empty">None recorded</span>`}</p>
        <p style="margin:0"><strong>Historical notes:</strong> ${c.priorNotes || html`<span class="empty">None recorded</span>`}</p>
      </div>

      <h2>My assessment</h2>
      <p>${cur ? levelPill(cur) : html`<span class="lvl-pill lvl-none">Not assessed</span>`} <a href="#/assessment/${c.catId}">Change it on the Assessment page</a></p>
      ${a.justification ? html`<h3>Promotion justification</h3><p class="verbatim">${a.justification}</p>` : ""}

      <h2>Supporting evidence</h2>
      ${evTextOf(id) ? html`<p class="verbatim">${evTextOf(id)}</p>` : html`<p class="empty">No evidence added yet.</p>`}
      ${links.length ? html`<ul class="ev-links">${links.map((l) => html`<li>${l}</li>`)}</ul>` : ""}
      ${ev.length ? html`<h2>Related evidence entries (${ev.length})</h2>${ev.map((e) => evidenceBlock(e))}` : ""}

      <div class="pager no-print">
        ${prev ? html`<a href="#/criteria/${prev.id}">← ${cut(prev.title, 50)}</a>` : html`<span></span>`}
        ${next ? html`<a href="#/criteria/${next.id}">${cut(next.title, 50)} →</a>` : html`<span></span>`}
      </div>`);
  }

  function viewProjects() {
    return html`<div class="page">
      <h1>Projects</h1>
      <p class="lead">Two projects provide most of the evidence. Agent Portal 3.0 is featured as the clearest recent example. Assurant Assist supports it.</p>
      ${S.data.projects.map((p) => html`<article class="block">
        <span class="tag ${p.featured ? "est" : ""}">${p.featured ? "Featured" : "Supporting"}</span>
        <h2 style="margin-top:8px"><a href="#/projects/${p.id}">${p.name}</a></h2>
        <p><strong>${p.headline}</strong></p>
        <p>${p.summary}</p>
        <p class="muted">${p.role} · ${evidenceByProject(p.id).length} evidence items</p>
      </article>`)}
    </div>`;
  }

  function viewProject(id) {
    const p = S.data.projById[id];
    if (!p) return viewNotFound();
    const ev = evidenceByProject(id);
    return html`<div class="page">
      <p class="crumbs" style="margin-top:0"><a href="#/projects">Projects</a></p>
      <span class="tag ${p.featured ? "est" : ""}">${p.featured ? "Featured project" : "Supporting project"}</span>
      <h1 style="margin-top:8px">${p.name}</h1>
      <p class="lead">${p.headline}</p>
      <div class="ev"><dl style="margin:0 0 16px">
        <dt>Role</dt><dd>${p.role}</dd><dt>Period</dt><dd>${p.period}</dd><dt>Status</dt><dd>${p.status}</dd></dl></div>
      <p>${p.summary}</p>

      <h2>How the work unfolded</h2>
      <ol class="arc">${p.arc.map((s) => html`<li><strong>${s.step}</strong><span>${s.text}</span></li>`)}</ol>

      <h2>Limits on what can be claimed</h2>
      <div class="note"><ul class="tight">${p.limitations.map((l) => html`<li>${l}</li>`)}</ul></div>

      <h2>Evidence from this project (${ev.length})</h2>
      ${ev.map((e) => evidenceBlock(e))}

      <h2>Original artifacts</h2>
      <ul>${p.artifacts.map((a) => html`<li>${safeUrl(a.url)
        ? html`<a href="${safeUrl(a.url)}" target="_blank" rel="noopener noreferrer">${a.label}</a>`
        : html`${a.label} <span class="tag gap">${a.note}</span>`}</li>`)}</ul>

      <h2>Next steps</h2>
      <ul class="tight">${p.nextSteps.map((n) => html`<li>${n}</li>`)}</ul>
    </div>`;
  }

  const viewNotFound = () => html`<div class="page"><h1>Page not found</h1><p><a href="#/assessment">Back to assessment</a></p></div>`;

  // ---------- actions ----------
  function closeMenus(except) {
    document.querySelectorAll(".lvl-menu").forEach((m) => {
      if (m === except) return;
      m.hidden = true;
      const b = m.parentElement.querySelector(".lvl-btn");
      if (b) b.setAttribute("aria-expanded", "false");
    });
  }

  const actions = {
    "lvl-toggle"(b) {
      const menu = b.parentElement.querySelector(".lvl-menu");
      const open = menu.hidden;
      closeMenus(menu);
      menu.hidden = !open;
      b.setAttribute("aria-expanded", String(open));
      if (open) { const sel = menu.querySelector('[aria-selected="true"]') || menu.querySelector(".lvl-opt"); sel && sel.focus(); }
    },
    async "lvl-pick"(b) {
      const cid = b.dataset.cid, v = b.dataset.v;
      const prev = S.fs.a[cid] ? { ...S.fs.a[cid] } : null;
      S.fs.a[cid] = { ...(S.fs.a[cid] || {}), rating: v };
      refreshRow(cid);
      const ok = await save(fsSet(`a_${cid}`, { rating: v }, ["rating"]));
      if (!ok) { if (prev) S.fs.a[cid] = prev; else delete S.fs.a[cid]; refreshRow(cid); }
    },
    "ev-edit"(b) {
      const cid = b.dataset.cid;
      S.ui.ev[cid] = { text: evTextOf(cid), links: evLinksOf(cid).map((l) => ({ ...l })) };
      refreshRow(cid);
      const ta = $(`#ta-${cid}`); ta && ta.focus();
    },
    "ev-cancel"(b) { delete S.ui.ev[b.dataset.cid]; refreshRow(b.dataset.cid); },
    "ev-rm"(b) { S.ui.ev[b.dataset.cid].links.splice(Number(b.dataset.i), 1); refreshRow(b.dataset.cid); },
    "ev-add-ev"(b) {
      const cid = b.dataset.cid, sel = $(`[data-pick="${cid}"]`), title = $(`[data-etitle="${cid}"]`).value.trim();
      if (!sel.value) return;
      const d = S.ui.ev[cid];
      if (!d.links.some((l) => l.t === "evidence" && l.id === sel.value)) d.links.push({ t: "evidence", id: sel.value, label: title, url: "" });
      refreshRow(cid);
    },
    "ev-add-url"(b) {
      const cid = b.dataset.cid, lbl = $(`[data-lbl="${cid}"]`).value.trim(), url = $(`[data-url="${cid}"]`).value.trim();
      if (!safeUrl(url)) { toast("Enter a link that starts with http:// or https://", true); return; }
      S.ui.ev[cid].links.push({ t: "url", label: lbl || url, url, id: "" });
      refreshRow(cid);
    },
    async "ev-save"(b) {
      const cid = b.dataset.cid, d = S.ui.ev[cid];
      const links = d.links.filter((l) => l.t === "url" || evById(l.id)).map((l) => ({ t: l.t, id: l.id || "", label: l.label || "", url: l.url || "" }));
      const ok = await save(fsSet(`a_${cid}`, { evidenceText: d.text, evidenceLinks: links }, ["evidenceText", "evidenceLinks"]));
      if (!ok) return;
      S.fs.a[cid] = { ...(S.fs.a[cid] || {}), evidenceText: d.text, evidenceLinks: links };
      delete S.ui.ev[cid];
      refreshRow(cid);
    },
    "cmt-add"(b) { S.ui.cmtOpen[b.dataset.cid] = true; S.ui.cmtEdit = null; refreshRow(b.dataset.cid); const t = $(`tbody[data-cid="${b.dataset.cid}"] [data-ctext]`); t && t.focus(); },
    "cmt-cancel"(b) { S.ui.cmtOpen[b.dataset.cid] = false; S.ui.cmtEdit = null; refreshRow(b.dataset.cid); },
    "cmt-edit"(b) { S.ui.cmtEdit = b.dataset.id; refreshRow(b.dataset.cid); },
    async "cmt-save"(b) {
      const cid = b.dataset.cid, id = b.dataset.id, scope = $(`tbody[data-cid="${cid}"]`);
      const text = $("[data-ctext]", scope).value.trim(), name = $("[data-cname]", scope).value.trim();
      if (!text) { toast("Write a comment first.", true); return; }
      if (id) {
        if (!(await save(fsSet(id, { text, name }, ["text", "name"])))) return;
        const m = S.fs.c.find((x) => x.id === id); m.text = text; m.name = name;
      } else {
        const doc = { cid, text, name, created: new Date().toISOString() };
        const nid = "c_" + uid();
        if (!(await save(fsSet(nid, doc)))) return;
        S.fs.c.push({ id: nid, ...doc });
      }
      S.ui.cmtOpen[cid] = false; S.ui.cmtEdit = null;
      refreshRow(cid);
    },
    async "cmt-del"(b) {
      if (!confirm("Delete this comment?")) return;
      if (!(await save(fsDel(b.dataset.id), "Deleted"))) return;
      S.fs.c = S.fs.c.filter((x) => x.id !== b.dataset.id);
      refreshRow(b.dataset.cid);
    },
    "ov-edit"() {
      const secs = ovSections().map((x) => ({ id: x.id || uid(), title: x.title || "", text: x.text || "", links: (x.links || []).map((l) => ({ ...l })) }));
      S.ui.ov = { sections: secs.length ? secs : [{ id: uid(), title: "", text: "", links: [] }] };
      render(true);
    },
    "ov-cancel"() { S.ui.ov = null; render(true); },
    "ov-add"() { S.ui.ov.sections.push({ id: uid(), title: "", text: "", links: [] }); render(true); },
    "ov-rm"(b) {
      const x = S.ui.ov.sections[+b.dataset.i];
      if ((x.title || x.text) && !confirm("Remove this section?")) return;
      S.ui.ov.sections.splice(+b.dataset.i, 1); render(true);
    },
    "ov-up"(b) { const a = S.ui.ov.sections, i = +b.dataset.i; if (i > 0) { [a[i - 1], a[i]] = [a[i], a[i - 1]]; render(true); } },
    "ov-down"(b) { const a = S.ui.ov.sections, i = +b.dataset.i; if (i < a.length - 1) { [a[i + 1], a[i]] = [a[i], a[i + 1]]; render(true); } },
    "ov-rmlink"(b) { S.ui.ov.sections[+b.dataset.i].links.splice(+b.dataset.j, 1); render(true); },
    "ov-addev"(b) {
      const i = b.dataset.i, sel = $(`[data-ovpick="${i}"]`), title = $(`[data-ovetitle="${i}"]`).value.trim();
      if (!sel.value) return;
      const x = S.ui.ov.sections[+i];
      if (!x.links.some((l) => l.t === "evidence" && l.id === sel.value)) x.links.push({ t: "evidence", id: sel.value, label: title, url: "" });
      render(true);
    },
    "ov-addurl"(b) {
      const i = b.dataset.i, lbl = $(`[data-ovlbl="${i}"]`).value.trim(), url = $(`[data-ovurl="${i}"]`).value.trim();
      if (!safeUrl(url)) { toast("Enter a link that starts with http:// or https://", true); return; }
      S.ui.ov.sections[+i].links.push({ t: "url", label: lbl || url, url, id: "" });
      render(true);
    },
    async "ov-save"() {
      const sections = S.ui.ov.sections
        .filter((x) => x.title.trim() || x.text.trim() || x.links.length)
        .map((x) => ({ id: x.id, title: x.title.trim(), text: x.text.replace(/\s+$/, ""),
          links: x.links.filter((l) => l.t === "url" || evById(l.id)).map((l) => ({ t: l.t, id: l.id || "", label: l.label || "", url: l.url || "" })) }));
      if (!(await save(fsSet("overall", { sections }, ["sections"])))) return;
      S.fs.overall = { sections };
      S.ui.ov = null;
      render(true);
    },
    "evn-new"() { S.ui.evForm = "new"; render(true); },
    "evn-edit"(b) { S.ui.evForm = b.dataset.id; render(true); },
    "evn-cancel"() { S.ui.evForm = null; render(true); },
    async "evn-save"(b) {
      const title = $("#evf-title").value.trim(), url = $("#evf-srcurl").value.trim();
      if (!title) { toast("Add a title.", true); return; }
      if (url && !safeUrl(url)) { toast("The source link must start with http:// or https://", true); return; }
      const f = { title, type: $("#evf-type").value, project: $("#evf-project").value, contribution: $("#evf-contribution").value.trim(),
        outcome: $("#evf-outcome").value.trim(), sourceLabel: $("#evf-srclabel").value.trim(), sourceUrl: url };
      let id = b.dataset.id;
      if (!id) { id = "x-" + uid(); f.custom = true; f.created = new Date().toISOString(); }
      if (!(await save(fsSet(`e_${id}`, f)))) return;
      S.fs.e[id] = { ...(S.fs.e[id] || {}), ...f };
      S.ui.evForm = null;
      render(true);
    },
    async "evn-del"(b) {
      const e = evById(b.dataset.id);
      if (!confirm(`Delete "${e.title}"? Links to it will disappear from the assessment.`)) return;
      if (e.custom) {
        if (!(await save(fsDel(`e_${e.id}`), "Deleted"))) return;
        delete S.fs.e[e.id];
      } else {
        if (!(await save(fsSet(`e_${e.id}`, { deleted: true }, ["deleted"]), "Deleted"))) return;
        S.fs.e[e.id] = { ...(S.fs.e[e.id] || {}), deleted: true };
      }
      S.ui.evForm = null;
      render(true);
    },

  };

  function onClick(e) {
    const b = e.target.closest("[data-act]");
    if (!b) { if (!e.target.closest(".lvl")) closeMenus(); return; }
    const fn = actions[b.dataset.act];
    if (fn) fn(b);
  }
  function onInput(e) {
    const t = e.target.closest("[data-draft]");
    if (t && S.ui.ev[t.dataset.cid]) S.ui.ev[t.dataset.cid].text = t.value;
    const o = e.target.closest("[data-ov]");
    if (o && S.ui.ov) S.ui.ov.sections[+o.dataset.i][o.dataset.ov] = o.value;
  }

  // ---------- router ----------
  function render(keepScroll) {
    if (!S.data) return;
    const [sec, id] = (location.hash.replace(/^#\/?/, "") || "").split("/");
    let view, navKey = sec || "assessment";
    if (!sec || sec === "assessment") { view = viewAssessment(id); navKey = "assessment"; }
    else if (sec === "evidence") view = viewEvidence(id);
    else if (sec === "overall") { view = viewOverall(); navKey = "overall"; }
    else if (sec === "criteria") { view = id ? viewCriterion(id) : viewAssessment(); navKey = "assessment"; }
    else if (sec === "projects") view = id ? viewProject(id) : viewProjects();
    else view = viewNotFound();

    document.getElementById("main").innerHTML = view.s;
    document.querySelectorAll("#nav a").forEach((a) => {
      if (a.dataset.route === navKey) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
    const o = S.data.overview;
    document.getElementById("site-head").innerHTML = html`<div class="head-text">
        <a class="brand" href="#/assessment">${o.subject} · ${o.currentRole} to ${o.targetRole} Assessment</a>
        <p class="head-sub">${o.purpose}</p></div>
      <p class="head-updated">Updated: <span id="updated-at">${updatedText()}</span></p>`.s;
    document.title = "Senior UX Designer Assessment";
    if (sec === "evidence" && id && $(`#evi-${CSS.escape(id)}`)) {
      const el = $(`#evi-${CSS.escape(id)}`);
      el.scrollIntoView({ block: "start" });
      el.classList.add("flash");
    } else if (keepScroll !== true) window.scrollTo(0, 0);
  }

  document.addEventListener("click", onClick);
  document.addEventListener("input", onInput);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeMenus(); });
  window.addEventListener("hashchange", () => { S.ui.evForm = null; S.ui.ov = null; render(); });
  load().then(() => render()).catch((err) => {
    document.getElementById("main").innerHTML =
      `<div class="page"><p class="note"><strong>Could not load the data.</strong> ${esc(err.message)}<br>Serve this folder over HTTP (for example <code>python3 -m http.server</code>) instead of opening index.html directly.</p></div>`;
  });
})();
