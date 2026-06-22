import { createClient } from '@supabase/supabase-js';

const DRAFT_KEY = 'porra.future.adminDraft.v1';
const runtimeSupabaseConfig = globalThis.PORRA_ADMIN_NEXT_SUPABASE || {};
const SUPABASE_URL = runtimeSupabaseConfig.url || '';
const SUPABASE_PUBLISHABLE_KEY = runtimeSupabaseConfig.publishableKey || '';
const hasSupabaseConfig = Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);

const supabase = hasSupabaseConfig
  ? createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)
  : null;

const state = {
  sessionUser: null,
  draft: loadDraft()
};

function uid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `draft-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createDefaultDraft() {
  return {
    pool: {
      name: 'Porra 2027',
      editionName: 'Mundial 2027',
      lockAt: '',
      groupExactPoints: 3,
      groupSignPoints: 2
    },
    members: [
      { id: uid(), name: '', email: '' }
    ],
    groups: [
      createGroupDraft('A'),
      createGroupDraft('B')
    ],
    miniQuestions: [
      createQuestionDraft()
    ],
    knockoutStages: [
      createKnockoutStageDraft('Octavos', 8),
      createKnockoutStageDraft('Cuartos', 4),
      createKnockoutStageDraft('Semifinales', 2),
      createKnockoutStageDraft('Final', 1),
      createKnockoutStageDraft('Campeón', 1)
    ]
  };
}

function createGroupDraft(letter = '') {
  return {
    id: uid(),
    letter,
    name: letter ? `Grupo ${letter}` : 'Nuevo grupo',
    teams: [
      createTeamDraft(),
      createTeamDraft(),
      createTeamDraft(),
      createTeamDraft()
    ]
  };
}

function createTeamDraft() {
  return {
    id: uid(),
    name: ''
  };
}

function createQuestionDraft() {
  return {
    id: uid(),
    label: '',
    fieldType: 'text',
    points: 1,
    options: ''
  };
}

function createKnockoutStageDraft(name = '', slots = 1) {
  return {
    id: uid(),
    name,
    slots
  };
}

function loadDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return createDefaultDraft();
    const parsed = JSON.parse(raw);
    return {
      ...createDefaultDraft(),
      ...parsed
    };
  } catch {
    return createDefaultDraft();
  }
}

function saveDraft() {
  localStorage.setItem(DRAFT_KEY, JSON.stringify(state.draft));
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function render() {
  const isLoggedIn = Boolean(state.sessionUser);
  document.getElementById('authPanel').hidden = isLoggedIn && hasSupabaseConfig;
  document.getElementById('workspace').hidden = !isLoggedIn;
  document.getElementById('exportDraftBtn').hidden = !isLoggedIn;
  document.getElementById('clearDraftBtn').hidden = !isLoggedIn;
  document.getElementById('logoutBtn').hidden = !isLoggedIn;
  const loginError = document.getElementById('loginError');
  const loginButton = document.querySelector('#loginForm button[type="submit"]');
  if (!hasSupabaseConfig) {
    loginError.textContent = 'Configura public/admin-next-config.js con el proyecto Supabase nuevo antes de iniciar sesión.';
    loginButton.disabled = true;
    return;
  }
  loginButton.disabled = false;
  if (!isLoggedIn) return;

  renderSummary();
  renderPoolForm();
  renderMembers();
  renderGroups();
  renderQuestions();
  renderKnockoutStages();
}

function renderSummary() {
  const cards = [
    ['Proyecto', new URL(SUPABASE_URL).host.replace('.supabase.co', '')],
    ['Participantes', state.draft.members.length],
    ['Grupos', state.draft.groups.length],
    ['Selecciones', state.draft.groups.reduce((sum, group) => sum + group.teams.length, 0)],
    ['Preguntas mini', state.draft.miniQuestions.length],
    ['Rondas cruces', state.draft.knockoutStages.length]
  ];
  document.getElementById('summaryCards').innerHTML = cards.map(([label, value]) => `
    <article class="card">
      <b>${escapeHtml(value)}</b>
      <span>${escapeHtml(label)}</span>
    </article>
  `).join('');
}

function renderPoolForm() {
  const form = document.getElementById('poolForm');
  form.elements.namedItem('name').value = state.draft.pool.name;
  form.elements.namedItem('editionName').value = state.draft.pool.editionName;
  form.elements.namedItem('lockAt').value = state.draft.pool.lockAt;
  form.elements.namedItem('groupExactPoints').value = state.draft.pool.groupExactPoints;
  form.elements.namedItem('groupSignPoints').value = state.draft.pool.groupSignPoints;
}

function renderMembers() {
  document.getElementById('membersList').innerHTML = state.draft.members.map(member => `
    <article class="item-card" data-member-id="${member.id}">
      <div class="inline-grid">
        <label>Nombre
          <input data-member-field="name" value="${escapeHtml(member.name)}" />
        </label>
        <label>Email
          <input data-member-field="email" type="email" value="${escapeHtml(member.email)}" />
        </label>
      </div>
      <div class="row-actions">
        <button type="button" data-remove-member="${member.id}">Eliminar</button>
      </div>
    </article>
  `).join('');
}

function renderGroups() {
  document.getElementById('groupsList').innerHTML = state.draft.groups.map(group => `
    <article class="item-card" data-group-id="${group.id}">
      <div class="item-head">
        <strong>${escapeHtml(group.name || 'Grupo sin nombre')}</strong>
        <div class="row-actions">
          <button type="button" data-add-team="${group.id}">Añadir país</button>
          <button type="button" data-remove-group="${group.id}">Eliminar grupo</button>
        </div>
      </div>
      <div class="inline-grid">
        <label>Letra
          <input data-group-field="letter" value="${escapeHtml(group.letter)}" />
        </label>
        <label>Nombre
          <input data-group-field="name" value="${escapeHtml(group.name)}" />
        </label>
      </div>
      <div class="stack compact">
        ${group.teams.map(team => `
          <div class="team-row" data-team-id="${team.id}">
            <input data-team-field="name" value="${escapeHtml(team.name)}" placeholder="Nombre del país" />
            <button type="button" data-remove-team="${group.id}:${team.id}">Quitar</button>
          </div>
        `).join('')}
      </div>
    </article>
  `).join('');
}

function renderQuestions() {
  document.getElementById('questionsList').innerHTML = state.draft.miniQuestions.map(question => `
    <article class="item-card" data-question-id="${question.id}">
      <div class="inline-grid">
        <label>Pregunta
          <input data-question-field="label" value="${escapeHtml(question.label)}" />
        </label>
        <label>Tipo
          <select data-question-field="fieldType">
            <option value="text"${question.fieldType === 'text' ? ' selected' : ''}>Texto libre</option>
            <option value="number"${question.fieldType === 'number' ? ' selected' : ''}>Número</option>
            <option value="select"${question.fieldType === 'select' ? ' selected' : ''}>Lista cerrada</option>
          </select>
        </label>
        <label>Puntos
          <input data-question-field="points" type="number" min="0" step="1" value="${escapeHtml(question.points)}" />
        </label>
      </div>
      <label>Opciones
        <input data-question-field="options" value="${escapeHtml(question.options)}" placeholder="Separadas por coma si el tipo es lista cerrada" />
      </label>
      <div class="row-actions">
        <button type="button" data-remove-question="${question.id}">Eliminar</button>
      </div>
    </article>
  `).join('');
}

function renderKnockoutStages() {
  document.getElementById('knockoutStagesList').innerHTML = state.draft.knockoutStages.map(stage => `
    <article class="item-card" data-stage-id="${stage.id}">
      <div class="inline-grid">
        <label>Ronda
          <input data-stage-field="name" value="${escapeHtml(stage.name)}" />
        </label>
        <label>Slots
          <input data-stage-field="slots" type="number" min="1" step="1" value="${escapeHtml(stage.slots)}" />
        </label>
      </div>
      <div class="row-actions">
        <button type="button" data-remove-stage="${stage.id}">Eliminar</button>
      </div>
    </article>
  `).join('');
}

function updateCollectionItem(collection, id, updater) {
  const index = collection.findIndex(item => item.id === id);
  if (index === -1) return false;
  collection[index] = updater(collection[index]);
  saveDraft();
  render();
  return true;
}

function mutateCollectionItem(collection, id, updater) {
  const index = collection.findIndex(item => item.id === id);
  if (index === -1) return false;
  collection[index] = updater(collection[index]);
  saveDraft();
  return true;
}

function downloadDraft() {
  const blob = new Blob([JSON.stringify(state.draft, null, 2)], { type: 'application/json' });
  const anchor = document.createElement('a');
  anchor.href = URL.createObjectURL(blob);
  anchor.download = 'porra-admin-next-draft.json';
  anchor.click();
  URL.revokeObjectURL(anchor.href);
}

async function initializeAuth() {
  if (!supabase) {
    render();
    return;
  }
  const { data } = await supabase.auth.getSession();
  state.sessionUser = data.session?.user || null;
  render();

  supabase.auth.onAuthStateChange((_event, session) => {
    state.sessionUser = session?.user || null;
    render();
  });
}

document.getElementById('poolForm').addEventListener('input', event => {
  state.draft.pool[event.target.name] = ['groupExactPoints', 'groupSignPoints'].includes(event.target.name)
    ? Number(event.target.value || 0)
    : event.target.value;
  saveDraft();
  renderSummary();
});

document.addEventListener('input', event => {
  const memberCard = event.target.closest('[data-member-id]');
  if (memberCard) {
    mutateCollectionItem(state.draft.members, memberCard.dataset.memberId, member => ({
      ...member,
      [event.target.dataset.memberField]: event.target.value
    }));
    return;
  }

  const groupCard = event.target.closest('[data-group-id]');
  if (groupCard && event.target.dataset.groupField) {
    mutateCollectionItem(state.draft.groups, groupCard.dataset.groupId, group => ({
      ...group,
      [event.target.dataset.groupField]: event.target.value
    }));
    return;
  }

  if (groupCard && event.target.dataset.teamField) {
    mutateCollectionItem(state.draft.groups, groupCard.dataset.groupId, group => ({
      ...group,
      teams: group.teams.map(team => team.id === event.target.closest('[data-team-id]')?.dataset.teamId
        ? { ...team, [event.target.dataset.teamField]: event.target.value }
        : team)
    }));
    return;
  }

  const questionCard = event.target.closest('[data-question-id]');
  if (questionCard) {
    mutateCollectionItem(state.draft.miniQuestions, questionCard.dataset.questionId, question => ({
      ...question,
      [event.target.dataset.questionField]: event.target.dataset.questionField === 'points'
        ? Number(event.target.value || 0)
        : event.target.value
    }));
    return;
  }

  const stageCard = event.target.closest('[data-stage-id]');
  if (stageCard) {
    mutateCollectionItem(state.draft.knockoutStages, stageCard.dataset.stageId, stage => ({
      ...stage,
      [event.target.dataset.stageField]: event.target.dataset.stageField === 'slots'
        ? Number(event.target.value || 1)
        : event.target.value
    }));
  }
});

document.addEventListener('click', event => {
  if (event.target.id === 'addMemberBtn') {
    state.draft.members.push({ id: uid(), name: '', email: '' });
    saveDraft();
    render();
    return;
  }
  if (event.target.id === 'addGroupBtn') {
    state.draft.groups.push(createGroupDraft());
    saveDraft();
    render();
    return;
  }
  if (event.target.id === 'addQuestionBtn') {
    state.draft.miniQuestions.push(createQuestionDraft());
    saveDraft();
    render();
    return;
  }
  if (event.target.id === 'addKnockoutStageBtn') {
    state.draft.knockoutStages.push(createKnockoutStageDraft());
    saveDraft();
    render();
    return;
  }
  if (event.target.id === 'exportDraftBtn') {
    downloadDraft();
    return;
  }
  if (event.target.id === 'clearDraftBtn') {
    state.draft = createDefaultDraft();
    saveDraft();
    render();
    return;
  }
  if (event.target.id === 'logoutBtn') {
    if (!supabase) return;
    supabase.auth.signOut();
    return;
  }

  const removeMemberId = event.target.dataset.removeMember;
  if (removeMemberId) {
    state.draft.members = state.draft.members.filter(member => member.id !== removeMemberId);
    saveDraft();
    render();
    return;
  }

  const addTeamGroupId = event.target.dataset.addTeam;
  if (addTeamGroupId) {
    updateCollectionItem(state.draft.groups, addTeamGroupId, group => ({
      ...group,
      teams: [...group.teams, createTeamDraft()]
    }));
    return;
  }

  const removeGroupId = event.target.dataset.removeGroup;
  if (removeGroupId) {
    state.draft.groups = state.draft.groups.filter(group => group.id !== removeGroupId);
    saveDraft();
    render();
    return;
  }

  const removeTeamRef = event.target.dataset.removeTeam;
  if (removeTeamRef) {
    const [groupId, teamId] = removeTeamRef.split(':');
    updateCollectionItem(state.draft.groups, groupId, group => ({
      ...group,
      teams: group.teams.filter(team => team.id !== teamId)
    }));
    return;
  }

  const removeQuestionId = event.target.dataset.removeQuestion;
  if (removeQuestionId) {
    state.draft.miniQuestions = state.draft.miniQuestions.filter(question => question.id !== removeQuestionId);
    saveDraft();
    render();
    return;
  }

  const removeStageId = event.target.dataset.removeStage;
  if (removeStageId) {
    state.draft.knockoutStages = state.draft.knockoutStages.filter(stage => stage.id !== removeStageId);
    saveDraft();
    render();
  }
});

document.getElementById('loginForm').addEventListener('submit', async event => {
  event.preventDefault();
  if (!supabase) return;
  const errorElement = document.getElementById('loginError');
  const formData = new FormData(event.currentTarget);
  errorElement.textContent = '';

  const { error } = await supabase.auth.signInWithPassword({
    email: String(formData.get('email') || '').trim(),
    password: String(formData.get('password') || '')
  });

  if (error) {
    console.error('signInWithPassword failed:', error);
    errorElement.textContent = error.message || 'No se pudo iniciar sesión.';
  } else {
    event.currentTarget.reset();
  }
});

initializeAuth();
