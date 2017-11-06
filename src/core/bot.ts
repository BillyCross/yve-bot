import { YveBotOptions, Rule, Answer } from '../types';
import { Store, StoreData } from './store';
import { Controller } from './controller';
import { Actions } from './actions';
import { Types } from './types';
import { Executors } from './executors';
import { Validators } from './validators';

import * as Exceptions from './exceptions';

function sanitizeRule(rule: Rule): Rule {
  if (typeof rule === 'string') {
    return { message: rule };
  }

  if (['SingleChoice', 'MultipleChoice'].indexOf(rule.type) >= 0) {
    rule.options = (rule.options || []).map(o => {
      if (typeof o === 'string') {
        return { value: o };
      }
      if (typeof o.synonyms === 'string') {
        o.synonyms = o.synonyms.split(',').map(s => s.trim());
      }
      return o;
    });
  }

  return rule;
}

export class YveBot {
  static exceptions: any;

  private handlers: { [handler: string]: Array<() => any> };
  private _rules?: Rule[];

  public options: YveBotOptions;
  public rules: Rule[];
  public controller: Controller;
  public store: Store;
  public sessionId: string;

  public types: Types;
  public actions: Actions;
  public executors: Executors;
  public validators: Validators;

  constructor(rules: Rule[], customOpts?: YveBotOptions) {
    const DEFAULT_OPTS: YveBotOptions = {
      enableWaitForSleep: true,
      timePerChar: 40,
    };

    this.sessionId = 'session';
    this.options = Object.assign({}, DEFAULT_OPTS, customOpts);
    this.rules = rules.map(rule => sanitizeRule(rule));
    this.handlers = {};

    this.store = new Store(this);
    this.controller = new Controller(this);

    this.on('error', err => { throw err; });
  }

  on(evt: string, fn: (...args: any[]) => any): this {
    const isUniqueType = ['error'].indexOf(evt) >= 0;
    if (!isUniqueType && evt in this.handlers) {
      this.handlers[evt].push(fn);
    } else {
      this.handlers[evt] = [fn];
    }
    return this;
  }

  start(): this {
    this.dispatch('start');
    this.controller.run().catch(this.tryCatch.bind(this));
    return this;
  }

  end(): this {
    this.dispatch('end', this.store.output());
    return this;
  }

  talk(message: string, opts?: Object): this {
    const rule = Object.assign({}, this.options.rule, opts || {});
    this.controller.sendMessage(message, rule);
    return this;
  }

  hear(answer: Answer | Answer[]): this {
    this.controller.receiveMessage(answer).catch(this.tryCatch.bind(this));
    return this;
  }

  dispatch(name: string, ...args) {
    if (name in this.handlers) {
      this.handlers[name].forEach(fn => fn(...args, this.sessionId));
    }
  }

  session(
    id: string,
    opts: { store?: StoreData, rules?: Rule[] } = {},
  ): this {
    this.sessionId = id;

    if (opts.rules) {
      this._rules = this.rules;
      this.rules = opts.rules.map(rule => sanitizeRule(rule));
    } else {
      this.rules = this._rules || this.rules;
    }

    if (opts.store) {
      this.store.replace(opts.store);
    } else {
      this.store.reset();
      this.controller.reindex();
    }
    return this;
  }

  private tryCatch(err: Error) {
    this.dispatch('error', err);
    this.end();
  }
}

YveBot.prototype.types = new Types;
YveBot.prototype.actions = new Actions;
YveBot.prototype.executors = new Executors;
YveBot.prototype.validators = new Validators;


YveBot.exceptions = Exceptions;
