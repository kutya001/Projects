// src/pages/forms/DirForm.js
import { esc } from '../../utils/dom.js';
import { REFNAME } from '../../core/state.js';
import { modal } from '../../ui/modal.js';
import { db, refreshAll } from '../../core/db.js';
import { afterChange, setDbBeacon } from '../../utils/logger.js';
import { toast } from '../../ui/toast.js';
import { getFormLayout, applyFormLayout, enableInteractiveFormDesigner } from '../../services/formLayout.js';

function getDefaultDirFields(type) {
  const fields = [
    { id: 'name', label: 'Название', width: 100 }
  ];
  if (type !== 'customers') {
    fields.push({ id: 'color', label: 'Цвет плашки', width: 50 });
  }
  if (type === 'customers') {
    fields.push({ id: 'contacts', label: 'Контактные данные', width: 100 });
  } else if (type === 'employees') {
    fields.push({ id: 'role', label: 'Роль (Дев / Агент)', width: 50 });
    fields.push({ id: 'position', label: 'Должность / Специализация', width: 50 });
    fields.push({ id: 'active', label: 'Статус (Активен / Неактивен)', width: 50 });
  } else if (type === 'priorities') {
    fields.push({ id: 'weight', label: 'Вес приоритета', width: 50 });
  } else if (type === 'taskStatuses' || type === 'stages') {
    fields.push({ id: 'order', label: 'Порядок сортировки', width: 50 });
  }
  fields.push({ id: 'desc', label: 'Описание', width: 100, height: 60 });
  fields.push({ id: 'note', label: 'Примечание', width: 100 });
  return fields;
}

export function openDirForm(S, type, id, presetOrOnSave, onSaveCb) {
  let preset = {};
  let onSave = onSaveCb;
  if (typeof presetOrOnSave === 'function') {
    onSave = presetOrOnSave;
  } else if (presetOrOnSave && typeof presetOrOnSave === 'object') {
    preset = presetOrOnSave;
  }

  const table = db[type];
  const list = S[type] || [];
  const oldItem = list.find(x => x.id === id);
  const item = oldItem ? JSON.parse(JSON.stringify(oldItem)) : {
    name: preset.name || '',
    color: preset.color || '#0B7285',
    contacts: preset.contacts || '',
    desc: preset.desc || '',
    note: preset.note || '',
    order: preset.order !== undefined ? preset.order : (list.length + 1),
    weight: preset.weight !== undefined ? preset.weight : (list.length + 1),
    role: preset.role || 'dev',
    position: preset.position || '',
    active: preset.active !== undefined ? preset.active : true
  };
  const isEdit = !!oldItem && !preset.isDuplicate;

  let extra = '';
  if (type === 'customers') {
    extra = `<div data-field="contacts" class="full"><label class="fl">Контактные данные</label><input type="text" name="contacts" value="${esc(item.contacts || '')}" required placeholder="Телефон, Email, ответственное лицо"></div>`;
  } else if (type === 'employees') {
    extra = `<div data-field="role"><label class="fl">Роль</label><select name="role"><option value="dev" ${item.role === 'dev' ? 'selected' : ''}>Разработчик</option><option value="agent" ${item.role === 'agent' ? 'selected' : ''}>Агент (ПМ / Аналитик)</option></select></div>
      <div data-field="position"><label class="fl">Должность / Специализация</label><input type="text" name="position" value="${esc(item.position || '')}" required></div>
      <div data-field="active"><label class="fl">Статус активности</label><select name="active">
        <option value="1" ${item.active !== false && item.active !== 0 ? 'selected' : ''}>● Активен (отображается в списках)</option>
        <option value="0" ${item.active === false || item.active === 0 ? 'selected' : ''}>○ Неактивен (архив / скрыт из списков)</option>
      </select></div>`;
  } else if (type === 'priorities') {
    extra = `<div data-field="weight"><label class="fl">Вес (1=высший)</label><input type="number" name="weight" value="${item.weight || 1}" required></div>`;
  } else if (type === 'taskStatuses' || type === 'stages') {
    extra = `<div data-field="order"><label class="fl">Порядок сортировки</label><input type="number" name="order" value="${item.order || 1}" required></div>`;
  }

  const showColor = type !== 'customers';
  const defaultFields = getDefaultDirFields(type);
  const formKey = `dirForm_${type}`;

  const body = `<form id="df" class="fgrid">
    <div data-field="name" class="full"><label class="fl">Название</label><input type="text" name="name" value="${esc(item.name || '')}" required></div>
    ${showColor ? `<div data-field="color"><label class="fl">Цвет плашки</label><input type="color" name="color" value="${item.color || '#0B7285'}" style="height:38px;padding:2px;cursor:pointer;width:100%"></div>` : ''}
    ${extra}
    <div data-field="desc" class="full"><label class="fl">Описание</label><textarea name="desc" placeholder="Подробное описание элемента..." required style="min-height:56px">${esc(item.desc || '')}</textarea></div>
    <div data-field="note" class="full"><label class="fl">Примечание</label><input type="text" name="note" placeholder="Дополнительное примечание (необязательно)" value="${esc(item.note || '')}"></div>
  </form>`;

  modal({
    title: isEdit ? 'Редактировать запись' : 'Новая запись',
    sub: 'СПРАВОЧНИК: ' + (REFNAME[type] || type).toUpperCase(),
    body,
    foot: `<button type="button" class="btn sm" id="btnCustFormLayout" style="margin-right:auto">Настроить поля</button><button class="btn" data-x>Отмена</button><button class="btn pri" data-save>Сохранить</button>`,
    mount(box) {
      const formEl = box.el.querySelector('#df');
      const designer = enableInteractiveFormDesigner(S, formKey, formEl, defaultFields);

      const btnCust = box.el.querySelector('#btnCustFormLayout');
      if (btnCust) {
        btnCust.onclick = () => {
          designer.toggle();
        };
      }
      box.el.querySelector('[data-x]').onclick = () => box.close();
      box.el.querySelector('[data-save]').onclick = async () => {
        const form = box.el.querySelector('#df');
        if (!form.checkValidity()) { form.reportValidity(); return; }
        const fd = new FormData(form);

        item.name = fd.get('name');
        item.desc = fd.get('desc');
        item.note = fd.get('note');

        if (showColor) item.color = fd.get('color');
        if (type === 'customers') item.contacts = fd.get('contacts');
        if (type === 'employees') {
          item.role = fd.get('role');
          item.position = fd.get('position');
          item.active = fd.get('active') === '1';
        }
        if (type === 'priorities') item.weight = +fd.get('weight');
        if (type === 'taskStatuses' || type === 'stages') item.order = +fd.get('order');

        if (!isEdit) {
          delete item.id;
          item.id = await table.add(item);
        } else {
          await table.put(item);
        }

        try {
          await refreshAll(S);
          await afterChange(S, onSave);
          toast('Справочник обновлен', 'ok');
          box.close();
        } catch (e) {
          setDbBeacon('error', '🔴 Ошибка базы данных');
          toast('Ошибка записи', 'err');
        }
      };
    }
  });
}
