(() => {
  "use strict";

  function countryRows(country) {
    return [
      ["政体", country.government.typeLabel],
      [country.government.powerName, Math.round(country.government.centralPower)],
      ["统治者", `${country.leader.title}${country.leader.name}`],
      ["家族", country.leader.dynasty],
      ["合法性", Math.round(country.legitimacy)],
      ["议会", country.government.assembly.unlocked ? country.government.assembly.type : "未解锁"],
    ];
  }

  function renderPolitics(country) {
    const reforms = Object.entries(country.government.reforms)
      .map(([key, value]) => `<button class="drawer-row political-action" data-reform="${key}">${key}<span>${value} / 5</span></button>`)
      .join("");
    const estates = Object.values(country.estates)
      .map(estate => `<div class="drawer-row">${estate.label}<span>${Math.round(estate.power)} / ${Math.round(estate.satisfaction)}</span></div>`)
      .join("");
    return `${countryRows(country).map(([label, value]) => `<div class="drawer-row">${label}<span>${value}</span></div>`).join("")}
      <div class="drawer-subtitle">改革槽</div>${reforms}
      <div class="drawer-subtitle">阶层：权力 / 满意</div>${estates}`;
  }

  function renderSystem(system, world) {
    const country = window.HIFI_WORLD_ENGINE.activeCountry(world);
    if (system === "国家") return renderPolitics(country);
    return null;
  }

  function openLayer(id) {
    const layer = document.getElementById(id);
    layer.classList.add("open");
    layer.setAttribute("aria-hidden", "false");
  }

  function closeLayer(id) {
    const layer = document.getElementById(id);
    layer.classList.remove("open");
    layer.setAttribute("aria-hidden", "true");
  }

  function countryDetailHtml(country) {
    const estateHtml = Object.values(country.estates).map(estate =>
      `<div class="estate-line"><span>${estate.label}</span><span>${Math.round(estate.power)}</span><span>${Math.round(estate.satisfaction)}</span></div>`
    ).join("");
    return `<div class="state-grid">
      ${[
        ["政体", country.government.typeLabel],
        [country.government.powerName, Math.round(country.government.centralPower)],
        ["合法性", Math.round(country.legitimacy)],
        ["行政 / 外交 / 军事", `${country.leader.abilities.administrative} / ${country.leader.abilities.diplomatic} / ${country.leader.abilities.military}`],
        ["粮食", Math.round(country.food)],
        ["金钱", Math.round(country.money)],
        ["军需", Math.round(country.military)],
        ["资本池", Math.round(country.capital || 0)],
      ].map(([label, value]) => `<div class="state-stat"><small>${label}</small><strong>${value}</strong></div>`).join("")}
    </div>
    <section class="state-section"><h3>时代处境</h3><p>${country.introduction}</p></section>
    <section class="state-section"><h3>阶层权力 / 满意度</h3>${estateHtml}</section>`;
  }

  function bindCountryDialogs(store) {
    let selectedPolity = store.getState().playerPolity;
    const modal = document.getElementById("countryModal");
    const selectModal = document.getElementById("countrySelectModal");
    const strip = document.getElementById("countryChoiceStrip");
    const preview = document.getElementById("countryChoicePreview");

    function renderCountryModal(polity = store.getState().playerPolity) {
      const country = store.getState().countries[polity];
      document.getElementById("countryModalTitle").textContent = country.name;
      document.getElementById("countryModalSubtitle").textContent = `${country.leader.title}${country.leader.name} · ${country.leader.dynasty}`;
      document.getElementById("countryModalBody").innerHTML = countryDetailHtml(country);
      openLayer("countryModal");
    }

    function renderChoicePreview() {
      const country = store.getState().countries[selectedPolity];
      preview.innerHTML = `<h3>${country.name}</h3><p>${country.introduction}</p>
        <div class="state-grid">${countryRows(country).slice(0, 4).map(([label, value]) => `<div class="state-stat"><small>${label}</small><strong>${value}</strong></div>`).join("")}</div>`;
      strip.querySelectorAll(".country-choice").forEach(button => button.classList.toggle("active", button.dataset.polity === selectedPolity));
    }

    function renderChoices(filter = "") {
      const query = filter.trim().toLowerCase();
      const countries = Object.values(store.getState().countries).filter(country =>
        !query || country.name.toLowerCase().includes(query) || country.government.typeLabel.includes(query)
      );
      strip.innerHTML = countries.map(country =>
        `<button class="country-choice" data-polity="${country.name}">${country.name}<br><small>${country.government.typeLabel}</small></button>`
      ).join("");
      strip.querySelectorAll(".country-choice").forEach(button => {
        button.addEventListener("click", () => {
          selectedPolity = button.dataset.polity;
          renderChoicePreview();
        });
      });
      if (!countries.some(country => country.name === selectedPolity)) selectedPolity = countries[0]?.name || store.getState().playerPolity;
      renderChoicePreview();
    }

    function renderPendingElection() {
      const election = store.getState().pendingElection;
      if (!election) {
        closeLayer("leaderElectionModal");
        return;
      }
      document.getElementById("leaderElectionReason").textContent = `${election.polity} · ${election.reason}`;
      const list = document.getElementById("leaderCandidateList");
      list.innerHTML = election.candidates.map((candidate, index) =>
        `<button class="leader-candidate" data-candidate="${index}">
          <strong>${candidate.title}${candidate.name}</strong>
          <span>${candidate.dynasty}</span>
          <span>行政 ${candidate.abilities.administrative} · 外交 ${candidate.abilities.diplomatic} · 军事 ${candidate.abilities.military}</span>
        </button>`
      ).join("");
      list.querySelectorAll("[data-candidate]").forEach(button => {
        button.addEventListener("click", () => {
          store.update(world => window.HIFI_POLITICS_ENGINE.completeElection(world, Number(button.dataset.candidate)));
          closeLayer("leaderElectionModal");
        });
      });
      openLayer("leaderElectionModal");
    }

    document.querySelectorAll("[data-close-dialog]").forEach(button => {
      button.addEventListener("click", () => closeLayer(button.dataset.closeDialog));
    });
    modal.addEventListener("click", event => { if (event.target === modal) closeLayer("countryModal"); });
    selectModal.addEventListener("click", event => { if (event.target === selectModal) closeLayer("countrySelectModal"); });
    document.getElementById("openCountrySelect").addEventListener("click", () => {
      closeLayer("countryModal");
      selectedPolity = store.getState().playerPolity;
      renderChoices();
      openLayer("countrySelectModal");
    });
    document.getElementById("countrySearch").addEventListener("input", event => renderChoices(event.target.value));
    document.getElementById("confirmCountryChoice").addEventListener("click", () => {
      store.update(world => window.HIFI_WORLD_ENGINE.setPlayerCountry(world, selectedPolity));
      closeLayer("countrySelectModal");
    });

    return { renderCountryModal, renderPendingElection, renderSystem };
  }

  window.HIFI_DRAWERS = { bindCountryDialogs, renderSystem };
})();
