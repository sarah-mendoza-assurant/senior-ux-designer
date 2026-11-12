/* Read-only promotion assessment site. All content comes from /data/*.json. */
(function () {
  "use strict";

  const STATUS = {
    "not-assessed": "Not assessed",
    developing: "Developing toward senior",
    meets: "Meets senior",
    exceeds: "Exceeds senior",
  };
  const VERIF = {
    "source-document": ["src", "Backed by source document"],
    "brief-only": ["brief", "From brief, needs source"],
    estimate: ["est", "Estimate, not measured"],
  };

  const S = { data: null, filters: { q: "", cat: "all", status: "all", evidence: "all" } };

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

  const statusBadge = (s) => html`<span class="badge ${s}">${STATUS[s]}</span>`;
  const verifBadge = (v) => {
    const [cls, label] = VERIF[v.level];
    return html`<span class="badge ${cls}">${label}</span>`;
  };

  async function load() {
    const names = ["criteria", "assessments", "evidence", "projects", "growth", "overview"];
    const res = await Promise.all(names.map((n) => fetch(`data/${n}.json`).then((r) => {
      if (!r.ok) throw new Error(`Could not load data/${n}.json`);
      return r.json();
    })));
    const [criteria, assessments, evidence, projects, growth, overview] = res;
    const all = [];
    criteria.categories.forEach((cat) => cat.criteria.forEach((c) => all.push({ ...c, catId: cat.id, catName: cat.name })));
    const byId = Object.fromEntries(all.map((c) => [c.id, c]));
    const evById = Object.fromEntries(evidence.evidence.map((e) => [e.id, e]));
    const projById = Object.fromEntries(projects.projects.map((p) => [p.id, p]));
    S.data = {
      criteria, all, byId, evById, projById,
      assessments: assessments.assessments,
      evidence: evidence.evidence,
      projects: projects.projects,
      growth, overview,
    };
  }

  const evidenceFor = (cid) => S.data.evidence.filter((e) => e.criteria.includes(cid));
  const asmt = (cid) => S.data.assessments[cid];
  const projName = (id) => (id ? S.data.projById[id].name : "Other contributions");
  const sourcedCount = (cid) => evidenceFor(cid).filter((e) => e.verification.level === "source-document").length;

  // ---------- shared pieces ----------
  function evidenceCard(e, currentCid) {
    const others = e.criteria.filter((c) => c !== currentCid);
    return html`<article class="card ev" id="${e.id}">
      <div class="chips">
        <span class="badge">${e.type}</span>${verifBadge(e.verification)}
        ${e.date ? html`<span class="badge">${e.date}</span>` : ""}
      </div>
      <h3>${e.title}</h3>
      <dl>
        <dt>Project</dt><dd>${e.project
          ? html`<a href="#/projects/${e.project}">${projName(e.project)}</a>`
          : html`Other contributions`}</dd>
        <dt>Personal contribution</dt><dd>${e.contribution}</dd>
        <dt>Outcome / impact</dt><dd>${e.outcome}</dd>
        <dt>Source</dt><dd>${e.source.label}${e.source.pages ? html` (${e.source.pages})` : ""}${
          e.source.url ? html` <a href="${e.source.url}" rel="noopener">Open</a>` : ""}</dd>
        ${e.verification.note ? html`<dt>Verification note</dt><dd>${e.verification.note}</dd>` : ""}
        <dt>Also supports</dt><dd><span class="chips">${others.length
          ? others.map((c) => html`<a class="chip" href="#/criteria/${c}">${S.data.byId[c].title.length > 48 ? S.data.byId[c].title.slice(0, 46) + "…" : S.data.byId[c].title}</a>`)
          : html`<span class="muted">Only this criterion</span>`}</span></dd>
      </dl>
    </article>`;
  }

  // ---------- views ----------
  function viewOverview() {
    const { overview: o, all, evById } = S.data;
    const counts = Object.keys(STATUS).map((k) => [k, all.filter((c) => asmt(c.id).status === k).length]);
    const withEv = all.filter((c) => evidenceFor(c.id).length).length;
    const noEv = all.filter((c) => !evidenceFor(c.id).length);
    const justified = all.filter((c) => asmt(c.id).justificationState !== "none").length;
    return html`
      <h1>${o.title}</h1>
      <p class="lead">${o.subject} · ${o.currentRole} to ${o.targetRole} · ${o.company} · Updated ${o.updated}</p>
      <p class="lead">${o.purpose}</p>
      <p>${o.summary}</p>

      <h2>Assessment status</h2>
      <div class="grid three">
        ${counts.map(([k, n]) => html`<div class="card"><div class="stat">${n}</div><div class="stat-label">${STATUS[k]}</div></div>`)}
        <div class="card"><div class="stat">${justified}<span class="muted"> / ${all.length}</span></div><div class="stat-label">Justifications written</div></div>
        <div class="card"><div class="stat">${withEv}<span class="muted"> / ${all.length}</span></div><div class="stat-label">Criteria with linked evidence</div></div>
      </div>

      <h2>Criteria by category</h2>
      <p class="muted">Seven original categories from the workbook. <a href="#/criteria">Open the full criteria matrix</a>.</p>
      <table class="matrix">
        <thead><tr><th>Category</th><th class="num">Criteria</th><th class="num">Assessed</th><th class="num">With evidence</th><th class="num">With source-backed evidence</th></tr></thead>
        <tbody>${S.data.criteria.categories.map((cat) => {
          const ids = cat.criteria.map((c) => c.id);
          return html`<tr>
            <td data-label="Category"><a class="crit" href="#/criteria" data-cat="${cat.id}">${cat.name}</a></td>
            <td class="num" data-label="Criteria">${ids.length}</td>
            <td class="num" data-label="Assessed">${ids.filter((i) => asmt(i).status !== "not-assessed").length}</td>
            <td class="num" data-label="With evidence">${ids.filter((i) => evidenceFor(i).length).length}</td>
            <td class="num" data-label="With source-backed evidence">${ids.filter((i) => sourcedCount(i)).length}</td>
          </tr>`;
        })}</tbody>
      </table>

      <h2>Featured evidence</h2>
      ${o.topEvidence.map((id) => evidenceCard(evById[id]))}
      <p><a href="#/projects/agent-portal-3">Read the Agent Portal 3.0 project</a> · <a href="#/projects/assurant-assist">Read the Assurant Assist project</a></p>

      <h2>Growth areas and gaps</h2>
      <div class="card">
        <p><strong>${noEv.length}</strong> of ${all.length} criteria have no evidence linked yet.
        <a href="#/growth">See evidence gaps and next steps</a>.</p>
        <ul class="tight">${S.data.growth.knownGrowthAreas.map((g) => html`<li><a href="#/criteria/${g.criterionId}">${S.data.byId[g.criterionId].title}</a>: ${g.note}</li>`)}</ul>
      </div>

      <h2>How to read this site</h2>
      <ul class="tight">${o.readingNotes.map((n) => html`<li>${n}</li>`)}</ul>`;
  }

  function filteredCriteria() {
    const f = S.filters;
    const q = f.q.trim().toLowerCase();
    return S.data.all.filter((c) => {
      if (f.cat !== "all" && c.catId !== f.cat) return false;
      if (f.status !== "all" && asmt(c.id).status !== f.status) return false;
      const n = evidenceFor(c.id).length;
      if (f.evidence === "has" && !n) return false;
      if (f.evidence === "none" && n) return false;
      if (q) {
        const hay = [c.activity, c.srUxd, c.uxd, c.priorRating, c.priorNotes, asmt(c.id).justification, c.catName].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  function matrixBody(list) {
    if (!list.length) return html`<p class="empty">No criteria match these filters.</p>`;
    return html`${S.data.criteria.categories.map((cat) => {
      const rows = list.filter((c) => c.catId === cat.id);
      if (!rows.length) return "";
      return html`<section aria-labelledby="cat-${cat.id}">
        <div class="cat-title"><h2 id="cat-${cat.id}">${cat.name}</h2><span class="muted">${rows.length} of ${cat.criteria.length} shown</span></div>
        <table class="matrix">
          <thead><tr><th>Criterion</th><th>Sr UXD expects</th><th>UXD expects</th><th>Prior-year self-rating</th><th>Current assessment</th><th class="num">Evidence</th></tr></thead>
          <tbody>${rows.map((c) => html`<tr>
            <td data-label="Criterion"><a class="crit" href="#/criteria/${c.id}">${c.title}</a>${c.description ? html`<span class="sub">${c.description}</span>` : ""}</td>
            <td data-label="Sr UXD">${c.srUxd}</td>
            <td data-label="UXD">${c.uxd || html`<span class="muted">—</span>`}</td>
            <td data-label="Prior-year self-rating">${c.priorRating || html`<span class="muted">—</span>`}</td>
            <td data-label="Current assessment">${statusBadge(asmt(c.id).status)}</td>
            <td class="num" data-label="Evidence">${evidenceFor(c.id).length}</td>
          </tr>`)}</tbody>
        </table>
      </section>`;
    })}`;
  }

  function viewCriteria() {
    const f = S.filters;
    const list = filteredCriteria();
    return html`
      <h1>Criteria</h1>
      <p class="lead">All ${S.data.all.length} criteria from the workbook, in their original seven categories. Select a criterion for its full detail, prior-year notes, justification and evidence.</p>
      <div class="filters no-print" role="search">
        <label class="grow">Search<input id="f-q" type="search" value="${f.q}" placeholder="Search criteria, expectations, notes"></label>
        <label>Category<select id="f-cat"><option value="all">All categories</option>${S.data.criteria.categories.map((c) =>
          html`<option value="${c.id}" ${f.cat === c.id ? raw("selected") : ""}>${c.name}</option>`)}</select></label>
        <label>Assessment<select id="f-status"><option value="all">All statuses</option>${Object.entries(STATUS).map(([k, v]) =>
          html`<option value="${k}" ${f.status === k ? raw("selected") : ""}>${v}</option>`)}</select></label>
        <label>Evidence<select id="f-evidence">
          <option value="all" ${f.evidence === "all" ? raw("selected") : ""}>Any</option>
          <option value="has" ${f.evidence === "has" ? raw("selected") : ""}>Has evidence</option>
          <option value="none" ${f.evidence === "none" ? raw("selected") : ""}>No evidence yet</option></select></label>
      </div>
      <p class="count" id="count" aria-live="polite">${list.length} of ${S.data.all.length} criteria shown</p>
      <div id="matrix">${matrixBody(list)}</div>
      <details class="card" style="margin-top:24px"><summary>Mastery scale from the workbook</summary>
        <ul class="tight">${S.data.criteria.masteryScale.map((m) => html`<li><strong>${m.level}</strong>: ${m.meaning}</li>`)}</ul>
        <p class="muted">${S.data.criteria.source.priorRatingNote}</p>
      </details>`;
  }

  function bindCriteria() {
    const refresh = () => {
      const list = filteredCriteria();
      document.getElementById("matrix").innerHTML = matrixBody(list).s;
      document.getElementById("count").textContent = `${list.length} of ${S.data.all.length} criteria shown`;
    };
    document.getElementById("f-q").addEventListener("input", (e) => { S.filters.q = e.target.value; refresh(); });
    [["f-cat", "cat"], ["f-status", "status"], ["f-evidence", "evidence"]].forEach(([id, key]) =>
      document.getElementById(id).addEventListener("change", (e) => { S.filters[key] = e.target.value; refresh(); }));
  }

  function viewCriterion(id) {
    const c = S.data.byId[id];
    if (!c) return viewNotFound();
    const a = asmt(id);
    const ev = evidenceFor(id);
    const idx = S.data.all.findIndex((x) => x.id === id);
    const prev = S.data.all[idx - 1], next = S.data.all[idx + 1];
    const stateLabel = { none: "No justification written yet", draft: "Draft", final: "Final" }[a.justificationState];
    return html`
      <p class="crumbs"><a href="#/criteria">Criteria</a> › ${c.catName}</p>
      <h1>${c.title}</h1>
      ${c.description ? html`<p class="lead verbatim">${c.description}</p>` : ""}
      <p class="muted">Workbook row ${c.sourceRow}. Wording below is exactly as written in the workbook.</p>

      <h2>Official expectations</h2>
      <div class="two-col">
        <div class="card exp"><h3>UXD expectation</h3><p class="val verbatim">${c.uxd || "Not specified in the workbook"}</p></div>
        <div class="card exp sr"><h3>Sr UXD expectation</h3><p class="val verbatim">${c.srUxd}</p></div>
      </div>

      <h2>Prior-year information</h2>
      <div class="card prior">
        <p class="tag">Recorded approximately one year ago. Not the current assessment.</p>
        <p><strong>Self-rating:</strong> ${c.priorRating || html`<span class="empty">None recorded</span>`}</p>
        <p><strong>Historical notes:</strong> ${c.priorNotes || html`<span class="empty">None recorded</span>`}</p>
      </div>

      <h2>Current assessment</h2>
      <div class="card">
        <p>${statusBadge(a.status)} <span class="badge">${stateLabel}</span>
        ${a.confidence ? html`<span class="badge">Confidence: ${a.confidence}</span>` : ""}</p>
        <h3>Promotion justification</h3>
        ${a.justification
          ? html`<p class="verbatim">${a.justification}</p>`
          : html`<p class="empty">Not written yet. It will be added once it can be grounded in specific, sourced work.</p>`}
        ${a.developmentNotes ? html`<h3>Development notes</h3><p class="verbatim">${a.developmentNotes}</p>` : ""}
      </div>

      <h2>Evidence (${ev.length})</h2>
      ${ev.length
        ? ev.map((e) => evidenceCard(e, id))
        : html`<p class="card empty">No evidence linked to this criterion yet. <span class="badge gap">Evidence gap</span></p>`}

      <div class="pager no-print">
        ${prev ? html`<a href="#/criteria/${prev.id}">← ${prev.title.length > 50 ? prev.title.slice(0, 48) + "…" : prev.title}</a>` : html`<span></span>`}
        ${next ? html`<a href="#/criteria/${next.id}">${next.title.length > 50 ? next.title.slice(0, 48) + "…" : next.title} →</a>` : html`<span></span>`}
      </div>`;
  }

  function viewProjects() {
    return html`
      <h1>Projects</h1>
      <p class="lead">Two projects provide most of the evidence. Agent Portal 3.0 is featured as the clearest recent example. Assurant Assist supports it.</p>
      ${S.data.projects.map((p) => html`<article class="card ${p.featured ? "featured" : ""}" style="margin-bottom:16px">
        ${p.featured ? html`<span class="badge est">Featured</span>` : html`<span class="badge">Supporting</span>`}
        <h2 style="margin-top:8px"><a href="#/projects/${p.id}">${p.name}</a></h2>
        <p><strong>${p.headline}</strong></p>
        <p>${p.summary}</p>
        <p class="muted">${p.role} · ${evidenceByProject(p.id).length} evidence items</p>
      </article>`)}`;
  }
  const evidenceByProject = (pid) => S.data.evidence.filter((e) => e.project === pid);

  function viewProject(id) {
    const p = S.data.projById[id];
    if (!p) return viewNotFound();
    const ev = evidenceByProject(id);
    return html`
      <p class="crumbs"><a href="#/projects">Projects</a></p>
      ${p.featured ? html`<span class="badge est">Featured project</span>` : html`<span class="badge">Supporting project</span>`}
      <h1>${p.name}</h1>
      <p class="lead">${p.headline}</p>
      <div class="card"><dl class="ev" style="margin:0">
        <dt>Role</dt><dd>${p.role}</dd>
        <dt>Period</dt><dd>${p.period}</dd>
        <dt>Status</dt><dd>${p.status}</dd></dl></div>
      <p>${p.summary}</p>

      <h2>How the work unfolded</h2>
      <div class="card"><ol class="arc">${p.arc.map((s) => html`<li><strong>${s.step}</strong><span>${s.text}</span></li>`)}</ol></div>

      <h2>Limits on what can be claimed</h2>
      <div class="note"><ul class="tight">${p.limitations.map((l) => html`<li>${l}</li>`)}</ul></div>

      <h2>Evidence from this project (${ev.length})</h2>
      ${ev.map((e) => evidenceCard(e))}

      <h2>Original artifacts</h2>
      <ul>${p.artifacts.map((a) => html`<li>${a.url
        ? html`<a href="${a.url}" rel="noopener">${a.label}</a>`
        : html`${a.label} <span class="badge gap">${a.note}</span>`}</li>`)}</ul>

      <h2>Next steps</h2>
      <ul class="tight">${p.nextSteps.map((n) => html`<li>${n}</li>`)}</ul>`;
  }

  function viewGrowth() {
    const g = S.data.growth, { all } = S.data;
    const none = all.filter((c) => !evidenceFor(c.id).length);
    const weak = all.filter((c) => evidenceFor(c.id).length && !sourcedCount(c.id));
    const gw = S.data.criteria.growthWorksheet;
    const list = (arr) => arr.length
      ? html`<ul class="tight">${arr.map((c) => html`<li><a href="#/criteria/${c.id}">${c.title}</a> <span class="muted">(${c.catName})</span></li>`)}</ul>`
      : html`<p class="empty">None.</p>`;
    return html`
      <h1>Growth and development</h1>
      <p class="lead">Open questions, evidence gaps and concrete next steps. Gaps are listed plainly so the assessment stays honest.</p>

      <h2>Evidence gaps</h2>
      <div class="grid two">
        <div class="card"><h3>No evidence linked (${none.length})</h3>${list(none)}</div>
        <div class="card"><h3>Evidence linked, but none source-backed yet (${weak.length})</h3>${list(weak)}</div>
      </div>

      <h2>Known growth areas</h2>
      <div class="card"><ul class="tight">${g.knownGrowthAreas.map((x) => html`<li><a href="#/criteria/${x.criterionId}">${S.data.byId[x.criterionId].title}</a>: ${x.note}</li>`)}</ul></div>

      <h2>Open questions</h2>
      <div class="card"><ul class="tight">${g.openQuestions.map((q) => html`<li>${q}</li>`)}</ul></div>

      <h2>Next steps</h2>
      <div class="card"><ol class="tight">${g.nextSteps.map((q) => html`<li>${q}</li>`)}</ol></div>

      <h2>Workbook growth worksheet</h2>
      <p class="muted">Preserved from the workbook's secondary worksheet (${gw.worksheet}) as a reference for growth planning.</p>
      <table class="matrix"><tbody>${gw.rows.map((r) => html`<tr><th scope="row" style="width:220px">${r.label}</th><td>${r.value || html`<span class="empty">Empty in the workbook</span>`}</td></tr>`)}</tbody></table>`;
  }

  function viewReview() {
    const o = S.data.overview;
    return html`
      <div class="no-print">
        <h1>Manager review</h1>
        <p class="lead">A print-friendly view of every criterion with its current assessment, justification and evidence references. Use your browser's print dialog to save as PDF.</p>
        <p><button class="btn" id="print-btn" type="button">Print or save as PDF</button></p>
      </div>
      <h1 style="display:none" class="print-only-title"></h1>
      <div class="card review-item"><strong>${o.title}</strong><br>${o.subject} · ${o.currentRole} to ${o.targetRole} · ${o.company} · ${o.updated}
        <p class="muted" style="margin-bottom:0">${o.readingNotes.join(" ")}</p></div>
      ${S.data.criteria.categories.map((cat) => html`
        <h2>${cat.name}</h2>
        ${cat.criteria.map((c) => {
          const a = asmt(c.id), ev = evidenceFor(c.id);
          return html`<section class="card review-item">
            <h3 style="margin-top:0">${c.title} ${statusBadge(a.status)}</h3>
            ${c.description ? html`<p class="verbatim muted">${c.description}</p>` : ""}
            <p><strong>Sr UXD:</strong> ${c.srUxd}<br><strong>UXD:</strong> ${c.uxd || "Not specified"}<br>
            <strong>Prior-year self-rating (about a year ago):</strong> ${c.priorRating || "None"}${c.priorNotes ? html` · Notes: ${c.priorNotes}` : ""}</p>
            <p><strong>Justification${a.justificationState === "draft" ? " (draft)" : ""}:</strong> ${a.justification || html`<span class="empty">Not written yet</span>`}</p>
            <p style="margin-bottom:0"><strong>Evidence:</strong> ${ev.length
              ? html`<ul class="tight">${ev.map((e) => html`<li>${e.title} <span class="muted">· ${projName(e.project)} · ${e.source.label}${e.source.pages ? ` (${e.source.pages})` : ""} · ${VERIF[e.verification.level][1]}</span></li>`)}</ul>`
              : html`<span class="empty">None linked yet</span>`}</p>
          </section>`;
        })}`)}`;
  }

  function viewNotFound() {
    return html`<h1>Page not found</h1><p><a href="#/">Back to overview</a></p>`;
  }

  // ---------- router ----------
  function render() {
    if (!S.data) return;
    const parts = (location.hash.replace(/^#\/?/, "") || "").split("/");
    const [sec, id] = parts;
    let view, bind;
    if (!sec) view = viewOverview();
    else if (sec === "criteria") { view = id ? viewCriterion(id) : viewCriteria(); if (!id) bind = bindCriteria; }
    else if (sec === "projects") view = id ? viewProject(id) : viewProjects();
    else if (sec === "growth") view = viewGrowth();
    else if (sec === "review") { view = viewReview(); bind = () => document.getElementById("print-btn").addEventListener("click", () => window.print()); }
    else view = viewNotFound();

    const main = document.getElementById("main");
    main.innerHTML = view.s;
    document.querySelectorAll("#nav a").forEach((a) => {
      if (a.dataset.route === (sec || "")) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
    // overview category links preselect the category filter
    main.querySelectorAll("a[data-cat]").forEach((a) => a.addEventListener("click", () => { S.filters.cat = a.dataset.cat; }));
    if (bind) bind();
    document.title = (sec ? sec[0].toUpperCase() + sec.slice(1) + " · " : "") + "Senior UX Promotion Assessment";
    if (!(sec === "criteria" && !id && location.hash.includes("keep"))) window.scrollTo(0, 0);
  }

  window.addEventListener("hashchange", render);
  load().then(render).catch((err) => {
    document.getElementById("main").innerHTML =
      `<div class="note"><strong>Could not load the data.</strong> ${esc(err.message)}<br>Serve this folder over HTTP (for example <code>python3 -m http.server</code>) instead of opening index.html directly.</div>`;
  });
})();
