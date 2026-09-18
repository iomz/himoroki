import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { isPasswordVisibilityShortcut, PasswordField, passwordVisibilityLabel,
  passwordVisibilityShortcut } from '../web/password-field.js';

test('password field preserves password-manager attributes and accessible reveal labels', () => {
  const markup = renderToStaticMarkup(createElement(PasswordField, {
    label: 'Current password', name: 'currentPassword', autoComplete: 'current-password', required: true,
  }));
  assert.match(markup, /type="password"/);
  assert.match(markup, /autocomplete="current-password"/i);
  assert.match(markup, /aria-label="Show password"/);
  assert.match(markup, /tabindex="-1"/);
  assert.match(markup, /aria-keyshortcuts="Alt\+Shift\+V"/);
  assert.match(markup, /Press Alt\+Shift\+V while focused here to show or hide this password/);
  assert.equal(passwordVisibilityShortcut, 'Alt+Shift+V');
  assert.equal(isPasswordVisibilityShortcut({ altKey: true, shiftKey: true, key: 'V' }), true);
  assert.equal(isPasswordVisibilityShortcut({ altKey: false, shiftKey: true, key: 'V' }), false);
  assert.equal(passwordVisibilityLabel(false), 'Show password');
  assert.equal(passwordVisibilityLabel(true), 'Hide password');
});
