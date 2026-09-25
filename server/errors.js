// Errors meant for the player: the client translates `code` (see public/js/i18n.js, err.*).
export class UserError extends Error {
  constructor(code, params = {}) {
    super(code);
    this.code = code;
    this.params = params;
  }
}
