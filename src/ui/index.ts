import YveBot from '../core';
import { Answer, ChatMessageSource, IChatOptions, IRule } from '../types';
import { ChatUI } from './ui';

export default class YveBotUI extends YveBot {
  public UIOptions: IChatOptions;
  public UI: ChatUI;

  constructor(rules: IRule[], opts?: IChatOptions) {
    const DEFAULT_OPTS: IChatOptions = {
      andSeparatorText: 'and',
      autoFocus: true,
      doneMultipleChoiceLabel: 'Done',
      inputPlaceholder: 'Type your message',
      inputPlaceholderMutipleChoice: 'Choose the options above',
      inputPlaceholderSingleChoice: 'Choose an option above',
      moreOptionsLabel: 'More options',
      submitLabel: 'Send',
      target: 'body',
      timestampFormatter: (ts) => new Date(ts).toUTCString().slice(-12, -4),
      timestampable: false,
    };
    const UIOptions = Object.assign({}, DEFAULT_OPTS, opts);
    super(rules, UIOptions.yveBotOptions);

    this.UIOptions = UIOptions;
    this.UI = new ChatUI(this.UIOptions);

    this
      .on('start', () => {
        document
          .querySelector(this.UIOptions.target)
          .appendChild(this.UI.chat);

        if (this.UIOptions.autoFocus) {
          const $input = this.UI.input;
          $input.focus();
        }
      })
      .on('talk', (msg: string, rule: IRule) => {
        this.newMessage('BOT', msg, rule);
      })
      .on('typing', () => this.typing())
      .on('typed', () => this.typed());

    this.UI.form.addEventListener('submit', (evt) => {
      evt.preventDefault();
      const input = this.UI.input;
      const msg = input.value.trim();

      if (msg) {
        this.hear(msg);
        this.newMessage('USER', msg);
        input.value = '';
      }
      if (this.UIOptions.autoFocus) {
        input.focus();
      }
    });
  }

  public typing() {
    this.UI.typing.classList.add('is-typing');
    this.UI.scrollDown(this.UI.typing.offsetHeight);
    return this;
  }

  public typed() {
    this.UI.typing.classList.remove('is-typing');
    this.UI.scrollDown(this.UI.typing.offsetHeight);
    return this;
  }

  public newMessage(source: ChatMessageSource, message: Answer | Answer[], rule?: IRule) {
    const { UI } = this;
    const sender = source === 'BOT' ? this.UIOptions.name : null;
    const thread = UI.createThread(source, UI.createTextMessage(message, sender));

    if (source === 'BOT') {
      switch (rule.type) {
        case 'SingleChoice':
        thread.appendChild(UI.createSingleChoiceMessage(rule, (label, value) => {
          this.hear(value);
          this.newMessage('USER', label);
        }));
        break;

        case 'MultipleChoice':
        thread.appendChild(UI.createMultipleChoiceMessage(rule, (label, value) => {
          this.hear(value);
          this.newMessage('USER', label);
        }));
        break;
      }
    }
    UI.appendThread(source, this.UI.conversation, thread);
    return this;
  }
}
