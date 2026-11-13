/* Read-only promotion assessment site. All content comes from /data/*.json. */
(function () {
  "use strict";

  const STATUS = { "not-assessed": "Not assessed", developing: "Developing", meets: "Meets", exceeds: "Exceeds" };
  const VERIF = {
    "source-document": ["src", "Backed by source document"],
    "brief-only": ["brief", "From brief, needs source"],
    estimate: ["est", "Estimate, not measured"],
  };
  const S = { data: null };

  // ---------- helpers ----------
  const esc = (s) =>
    String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  class Raw { constructor(s) { this.s = s; } }
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
  const safeUrl = (u) => (/^https?:\/\//i.test(u || "") ? u : null);

  const statusBadge = (s) => html`<span class="status ${s}">${STATUS[s]}</span>`;
  const verifTag = (v) => html`<span class="tag ${VERIF[v.level][0]}">${VERIF[v.level][1]}</span>`;

  async function load() {
    const names = ["criteria", "assessments", "evidence", "projects", "growth", "overview"];
    const res = await Promise.all(names.map((n) => fetch(`data/${n}.json`).then((r) => {
      if (!r.ok) throw new Error(`Could not load data/${n}.json`);
      return r.json();
    })));
    const [criteria, assessments, evidence, projects, growth, overview] = res;
    const all = [];
    criteria.categories.forEach((cat) => cat.criteria.forEach((c) => all.push({ ...c, catId: cat.id, catName: cat.name })));
    S.data = {
      criteria, all, growth, overview,
      byId: Object.fromEntries(all.map((c) => [c.id, c])),
      evById: Object.fromEntries(evidence.evidence.map((e) => [e.id, e])),
      projById: Object.fromEntries(projects.projects.map((p) => [p.id, p])),
      assessments: assessments.assessments,
      evidence: evidence.evidence,
      projects: projects.projects,
    };
  }

  const evidenceFor = (cid) => S.data.evidence.filter((e) => e.criteria.includes(cid));
  const asmt = (cid) => S.data.assessments[cid];
  const projName = (id) => (id ? S.data.projById[id].name : "Other contributions");
  const sourcedCount = (cid) => evidenceFor(cid).filter((e) => e.verification.level === "source-document").length;
  const evidenceByProject = (pid) => S.data.evidence.filter((e) => e.project === pid);
  const cut = (t, n) => (t.length > n ? t.slice(0, n - 2) + "…" : t);

  // Supporting documents for a criterion, derived from its linked evidence (no invented links).
  function sourcesFor(cid) {
    const seen = new Map();
    let needsSource = false;
    evidenceFor(cid).forEach((e) => {
      if (e.verification.level === "brief-only") needsSource = true;
      e.source.label.split(";").map((x) => x.trim()).forEach((raw) => {
        if (!raw || /^project brief/i.test(raw)) return;
        const name = raw.replace(/\.(pdf|docx)$/i, "");
        if (!seen.has(name)) seen.set(name, e.source.url || null);
      });
    });
    const out = [...seen].map(([label, url]) => ({ label, url: safeUrl(url), kind: "doc" }));
    (asmt(cid).links || []).forEach((l) => out.unshift({ label: l.label, url: safeUrl(l.url), kind: "link" }));
    if (needsSource) out.push({ label: "Project brief (needs a source)", url: null, kind: "flag" });
    return out;
  }

  // ---------- shared pieces ----------
  function evidenceCell(c) {
    const a = asmt(c.id);
    const src = sourcesFor(c.id);
    if (!a.evidenceSummary && !src.length) return html`<p class="none-yet">No evidence linked yet.</p>`;
    return html`${a.evidenceSummary ? html`<p class="ev-text">${a.evidenceSummary}</p>` : ""}
      ${src.length ? html`<ul class="ev-links">${src.map((s) =>
        s.url ? html`<li><a href="${s.url}" rel="noopener">${s.label}</a></li>`
              : html`<li class="plain ${s.kind === "flag" ? "flag" : ""}">${s.label}</li>`)}</ul>` : ""}`;
  }

  function assessmentRow(c) {
    return html`<tr>
      <td data-label="Requirement"><a class="req-title" href="#/criteria/${c.id}">${c.title}</a>${
        c.description ? html`<p class="req-desc">${c.description}</p>` : ""}</td>
      <td data-label="Senior UX Designer expectation"><span class="srbadge">Sr UXD</span><p class="exp-text">${c.srUxd}</p></td>
      <td data-label="My assessment">${statusBadge(asmt(c.id).status)}${
        c.priorRating ? html`<span class="prior">Prior year: ${c.priorRating}</span>` : ""}</td>
      <td data-label="Supporting evidence">${evidenceCell(c)}</td>
    </tr>`;
  }

  function assessmentTable(cat) {
    return html`<table class="assessment">
      <colgroup><col class="c1"><col class="c2"><col class="c3"><col class="c4"></colgroup>
      <thead><tr><th scope="col">Requirement</th><th scope="col">Senior UX Designer<br>Expectation</th><th scope="col">My assessment</th><th scope="col">Supporting evidence</th></tr></thead>
      <tbody>${cat.criteria.map((c) => assessmentRow({ ...c, catId: cat.id, catName: cat.name }))}</tbody>
    </table>`;
  }

  function sidebar(activeCat, activeProj) {
    return html`<aside class="sidebar" aria-label="Activity sections">
      <h2>Activity Sections</h2>
      <p class="sub">From Senior UX Designer Workbook</p>
      <ul>${S.data.criteria.categories.map((cat) => html`<li class="cat"><a href="#/assessment/${cat.id}" ${
        cat.id === activeCat ? new Raw('aria-current="page"') : ""}><span>${cat.name}</span><span class="count">${cat.criteria.length}</span></a></li>`)}</ul>
      <div class="group"><h3>Project evidence</h3>
        ${S.data.projects.map((p) => html`<a href="#/projects/${p.id}">${p.name}</a>`)}
      </div>
      <div class="group"><a href="#/review">Print all sections</a></div>
    </aside>`;
  }

  function withSidebar(activeCat, content) {
    return html`<div class="layout">${sidebar(activeCat)}<section class="content">${content}</section></div>`;
  }

  function evidenceBlock(e, currentCid) {
    const others = e.criteria.filter((c) => c !== currentCid);
    return html`<article class="block ev" id="${e.id}">
      <div class="chips"><span class="tag">${e.type}</span>${verifTag(e.verification)}${e.date ? html`<span class="tag">${e.date}</span>` : ""}</div>
      <h3>${e.title}</h3>
      <dl>
        <dt>Project</dt><dd>${e.project ? html`<a href="#/projects/${e.project}">${projName(e.project)}</a>` : html`Other contributions`}</dd>
        <dt>Personal contribution</dt><dd>${e.contribution}</dd>
        <dt>Outcome / impact</dt><dd>${e.outcome}</dd>
        <dt>Source</dt><dd>${e.source.label}${e.source.pages ? html` (${e.source.pages})` : ""}${
          safeUrl(e.source.url) ? html` <a href="${safeUrl(e.source.url)}" rel="noopener">Open</a>` : ""}</dd>
        ${e.verification.note ? html`<dt>Verification note</dt><dd>${e.verification.note}</dd>` : ""}
        <dt>Also supports</dt><dd><span class="chips">${others.length
          ? others.map((c) => html`<a class="chip" href="#/criteria/${c}">${cut(S.data.byId[c].title, 48)}</a>`)
          : html`<span class="muted">Only this requirement</span>`}</span></dd>
      </dl>
    </article>`;
  }

  // ---------- views ----------
  function viewAssessment(catId) {
    const cat = S.data.criteria.categories.find((c) => c.id === catId) || S.data.criteria.categories[0];
    const o = S.data.overview;
    return withSidebar(cat.id, html`
      <div class="intro">
        <p class="eyebrow">${o.company} · ${o.currentRole} to ${o.targetRole}</p>
        <p class="lead">${o.purpose}</p>
        <p class="muted">${o.subject} · Updated ${o.updated}</p>
      </div>
      <p class="eyebrow">Activity section</p>
      <div class="section-head">
        <h1 class="cat-h">${cat.name}</h1>
        <div class="meta"><span>${cat.criteria.length} requirements</span></div>
      </div>
      ${assessmentTable(cat)}
      <p class="muted" style="margin-top:20px">Prior-year ratings were recorded about a year ago and are shown for reference only. Evidence marked "needs a source" comes from the project brief and has no supporting document yet.</p>`);
  }

  function viewReview() {
    return html`<div class="page" style="max-width:none">
      <div class="no-print section-head" style="margin-top:32px">
        <h1>All sections</h1>
        <div class="meta"><button class="btn" id="print-btn" type="button">Print or save as PDF</button></div>
      </div>
      <p class="muted no-print">Every requirement with its assessment and evidence, for printing.</p>
      ${S.data.criteria.categories.map((cat) => html`<section class="review-cat"><h2>${cat.name} <span class="muted" style="font-weight:400">· ${cat.criteria.length} requirements</span></h2>${assessmentTable(cat)}</section>`)}
    </div>`;
  }

  function viewOverview() {
    const { overview: o, all, evById } = S.data;
    const counts = Object.keys(STATUS).map((k) => [k, all.filter((c) => asmt(c.id).status === k).length]);
    const withEv = all.filter((c) => evidenceFor(c.id).length).length;
    const noEv = all.filter((c) => !evidenceFor(c.id).length);
    const justified = all.filter((c) => asmt(c.id).justificationState !== "none").length;
    return html`<div class="page">
      <h1>Evidence</h1>
      <p class="lead">${o.summary}</p>

      <h2>Assessment status</h2>
      <div class="stats">
        ${counts.map(([k, n]) => html`<div><div class="stat">${n}</div><div class="stat-label">${STATUS[k]}</div></div>`)}
        <div><div class="stat">${justified}<span class="muted"> / ${all.length}</span></div><div class="stat-label">Justifications written</div></div>
        <div><div class="stat">${withEv}<span class="muted"> / ${all.length}</span></div><div class="stat-label">Requirements with evidence</div></div>
      </div>

      <h2>Requirements by section</h2>
      <table class="plain">
        <thead><tr><th>Section</th><th class="num">Requirements</th><th class="num">Assessed</th><th class="num">With evidence</th><th class="num">With source-backed evidence</th></tr></thead>
        <tbody>${S.data.criteria.categories.map((cat) => {
          const ids = cat.criteria.map((c) => c.id);
          return html`<tr><td><a href="#/assessment/${cat.id}"><strong>${cat.name}</strong></a></td>
            <td class="num">${ids.length}</td>
            <td class="num">${ids.filter((i) => asmt(i).status !== "not-assessed").length}</td>
            <td class="num">${ids.filter((i) => evidenceFor(i).length).length}</td>
            <td class="num">${ids.filter((i) => sourcedCount(i)).length}</td></tr>`;
        })}</tbody>
      </table>

      <h2>Featured evidence</h2>
      ${o.topEvidence.map((id) => evidenceBlock(evById[id]))}
      <p><a href="#/projects/agent-portal-3">Agent Portal 3.0 project</a> · <a href="#/projects/assurant-assist">Assurant Assist project</a></p>

      <h2>Growth areas and gaps</h2>
      <p><strong>${noEv.length}</strong> of ${all.length} requirements have no evidence linked yet. <a href="#/growth">See evidence gaps and next steps</a>.</p>
      <ul class="tight">${S.data.growth.knownGrowthAreas.map((g) => html`<li><a href="#/criteria/${g.criterionId}">${S.data.byId[g.criterionId].title}</a>: ${g.note}</li>`)}</ul>

      <h2>How to read this site</h2>
      <ul class="tight">${o.readingNotes.map((n) => html`<li>${n}</li>`)}</ul>
    </div>`;
  }

  function viewCriterion(id) {
    const c = S.data.byId[id];
    if (!c) return viewNotFound();
    const a = asmt(id), ev = evidenceFor(id);
    const idx = S.data.all.findIndex((x) => x.id === id);
    const prev = S.data.all[idx - 1], next = S.data.all[idx + 1];
    const stateLabel = { none: "No justification written yet", draft: "Draft", final: "Final" }[a.justificationState];
    return withSidebar(c.catId, html`
      <p class="crumbs" style="margin-top:0"><a href="#/assessment/${c.catId}">${c.catName}</a> › Requirement detail</p>
      <h1 style="font-size:1.8rem">${c.title}</h1>
      ${c.description ? html`<p class="lead verbatim">${c.description}</p>` : ""}
      <p class="muted">Workbook row ${c.sourceRow}. Wording is exactly as written in the workbook.</p>

      <h2>Official expectations</h2>
      <div class="two-col">
        <div class="exp-block"><h3>UXD expectation</h3><p class="val">${c.uxd || "Not specified in the workbook"}</p></div>
        <div class="exp-block sr"><h3>Sr UXD expectation</h3><p class="val">${c.srUxd}</p></div>
      </div>

      <h2>Prior-year information</h2>
      <div class="prior-box">
        <p class="label">Recorded approximately one year ago. Not the current assessment.</p>
        <p style="margin:0 0 4px"><strong>Self-rating:</strong> ${c.priorRating || html`<span class="empty">None recorded</span>`}</p>
        <p style="margin:0"><strong>Historical notes:</strong> ${c.priorNotes || html`<span class="empty">None recorded</span>`}</p>
      </div>

      <h2>Current assessment</h2>
      <p>${statusBadge(a.status)} <span class="tag">${stateLabel}</span>${a.confidence ? html` <span class="tag">Confidence: ${a.confidence}</span>` : ""}</p>
      <h3>Promotion justification</h3>
      ${a.justification ? html`<p class="verbatim">${a.justification}</p>`
        : html`<p class="empty">Not written yet. It will be added once it can be grounded in specific, sourced work.</p>`}
      ${a.developmentNotes ? html`<h3>Development notes</h3><p class="verbatim">${a.developmentNotes}</p>` : ""}

      <h2>Evidence (${ev.length})</h2>
      ${ev.length ? ev.map((e) => evidenceBlock(e, id)) : html`<p class="empty">No evidence linked yet. <span class="tag gap">Evidence gap</span></p>`}

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
        ? html`<a href="${safeUrl(a.url)}" rel="noopener">${a.label}</a>`
        : html`${a.label} <span class="tag gap">${a.note}</span>`}</li>`)}</ul>

      <h2>Next steps</h2>
      <ul class="tight">${p.nextSteps.map((n) => html`<li>${n}</li>`)}</ul>
    </div>`;
  }

  function viewGrowth() {
    const g = S.data.growth, { all } = S.data;
    const none = all.filter((c) => !evidenceFor(c.id).length);
    const weak = all.filter((c) => evidenceFor(c.id).length && !sourcedCount(c.id));
    const gw = S.data.criteria.growthWorksheet;
    const list = (arr) => arr.length
      ? html`<ul class="tight">${arr.map((c) => html`<li><a href="#/criteria/${c.id}">${c.title}</a> <span class="muted">(${c.catName})</span></li>`)}</ul>`
      : html`<p class="empty">None.</p>`;
    return html`<div class="page">
      <h1>Growth and development</h1>
      <p class="lead">Open questions, evidence gaps and concrete next steps. Gaps are listed plainly so the assessment stays honest.</p>

      <h2>Evidence gaps</h2>
      <div class="grid two">
        <div><h3 style="margin-top:0">No evidence linked (${none.length})</h3>${list(none)}</div>
        <div><h3 style="margin-top:0">Evidence linked, but none source-backed yet (${weak.length})</h3>${list(weak)}</div>
      </div>

      <h2>Known growth areas</h2>
      <ul class="tight">${g.knownGrowthAreas.map((x) => html`<li><a href="#/criteria/${x.criterionId}">${S.data.byId[x.criterionId].title}</a>: ${x.note}</li>`)}</ul>

      <h2>Open questions</h2>
      <ul class="tight">${g.openQuestions.map((q) => html`<li>${q}</li>`)}</ul>

      <h2>Next steps</h2>
      <ol class="tight">${g.nextSteps.map((q) => html`<li>${q}</li>`)}</ol>

      <h2>Workbook growth worksheet</h2>
      <p class="muted">Preserved from the workbook's secondary worksheet (${gw.worksheet}) as a reference for growth planning.</p>
      <table class="plain"><tbody>${gw.rows.map((r) => html`<tr><th scope="row" style="width:220px">${r.label}</th><td>${r.value || html`<span class="empty">Empty in the workbook</span>`}</td></tr>`)}</tbody></table>
    </div>`;
  }

  function viewNotFound() {
    return html`<div class="page"><h1>Page not found</h1><p><a href="#/assessment">Back to assessment</a></p></div>`;
  }

  // ---------- router ----------
  function render() {
    if (!S.data) return;
    const [sec, id] = (location.hash.replace(/^#\/?/, "") || "").split("/");
    let view, bind, navKey = sec || "";
    if (!sec || sec === "assessment") { view = viewAssessment(id); navKey = "assessment"; }
    else if (sec === "evidence") view = viewOverview();
    else if (sec === "criteria") { view = id ? viewCriterion(id) : viewAssessment(); navKey = "assessment"; }
    else if (sec === "review") { view = viewReview(); navKey = "assessment"; bind = () => document.getElementById("print-btn").addEventListener("click", () => window.print()); }
    else if (sec === "projects") view = id ? viewProject(id) : viewProjects();
    else if (sec === "growth") view = viewGrowth();
    else view = viewNotFound();

    document.getElementById("main").innerHTML = view.s;
    document.querySelectorAll("#nav a").forEach((a) => {
      if (a.dataset.route === navKey) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
    if (bind) bind();
    document.title = "Senior UX Designer Assessment";
    window.scrollTo(0, 0);
  }

  window.addEventListener("hashchange", render);
  load().then(render).catch((err) => {
    document.getElementById("main").innerHTML =
      `<div class="page"><p class="note"><strong>Could not load the data.</strong> ${esc(err.message)}<br>Serve this folder over HTTP (for example <code>python3 -m http.server</code>) instead of opening index.html directly.</p></div>`;
  });
})();
