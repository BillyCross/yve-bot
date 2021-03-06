import * as mocks from '@test/mocks';
import { loadYaml, sleep } from '@test/utils';
import * as faker from 'faker';

import YveBot from '..';
import { Controller } from '../controller';
import { InvalidAttributeError, RuleNotFound } from '../exceptions';
import { Store } from '../store';
import { calculateDelayToTypeMessage } from '../utils';

const OPTS = {
  enableWaitForSleep: false,
};

test('custom define', () => {
  YveBot.actions.define('test', 1);
  YveBot.types.define('test', 2);
  YveBot.executors.define('test', 3);
  YveBot.validators.define('test', 4);

  const bot = new YveBot([]);

  /* tslint:disable */
  expect((<any>bot.actions).test).toBe(1);
  expect((<any>bot.types).test).toBe(2);
  expect((<any>bot.executors).test).toBe(3);
  expect((<any>bot.validators).test).toBe(4);
  /* tslint:enable */
});

test('initial state', () => {
  const opts = {
    enableWaitForSleep: false,
    timePerChar: 40,
    rule: {
      delay: 1,
      sleep: 1,
    },
  };
  const bot = new YveBot([], opts);
  expect(bot.sessionId).toBe('session');
  expect(bot.options).toEqual(opts);
  expect(bot.store).toBeInstanceOf(Store);
  expect(bot.controller).toBeInstanceOf(Controller);
});

test('sanitize rule', () => {
  const rules = loadYaml(`
  - Hello
  - type: SingleChoice
  - type: MultipleChoice
    options:
      - One
  - type: SingleChoice
    options:
      - value: One
        synonyms: 1, one, oNe,ONE
  `);
  const bot = new YveBot(rules, OPTS);
  expect(bot.rules[0].message).toBe('Hello');
  expect(bot.rules[1].options).toEqual([]);
  expect(bot.rules[2].options).toEqual([{ value: 'One' }]);
  expect(bot.rules[3].options[0].synonyms).toEqual([ '1', 'one', 'oNe', 'ONE' ]);
});

test('convert flows to rules', () => {
  const rules = loadYaml(`
  - flow: welcome
    rules:
      - Hello!
      - type: String

  - flow: bye
    rules:
      - Bye!
  `);
  const bot = new YveBot(rules, OPTS);
  expect(bot.rules).toHaveLength(3);

  expect(bot.rules[0].message).toBe('Hello!');
  expect(bot.rules[0].flow).toBe('welcome');

  expect(bot.rules[1].type).toBe('String');
  expect(bot.rules[1].flow).toBe('welcome');

  expect(bot.rules[2].message).toBe('Bye!');
  expect(bot.rules[2].flow).toBe('bye');
});

test('user context', () => {
  const context = { a: 1, b: { c: 3 }};
  const bot = new YveBot([], { context });
  expect(bot.context).toEqual(context);
});

test('event binding', async () => {
  const rules = loadYaml(`
  - message: Colors?
    name: color
    type: String
  `);
  const session = 'session';
  const color = 'blue';
  const output = { color };

  const onStart = jest.fn();
  const onStartCopy = jest.fn();
  const onEnd = jest.fn();
  const onHear = jest.fn();
  const onTyping = jest.fn();
  const onTyped = jest.fn();
  const onTalk = jest.fn();

  const bot = new YveBot(rules, OPTS)
    .on('start', onStart)
    .on('start', onStartCopy)
    .on('end', onEnd)
    .on('hear', onHear)
    .on('typing', onTyping)
    .on('typed', onTyped)
    .on('talk', onTalk)
    .start();

  expect(onStart).toBeCalledWith(session);
  expect(onStartCopy).toBeCalledWith(session);

  await sleep();
  expect(onTyping).toBeCalledWith(session);
  expect(onTyped).toBeCalledWith(session);
  expect(onTalk).toBeCalledWith(rules[0].message, rules[0], session);
  expect(onHear).toBeCalledWith(session);

  bot.hear(color);
  await sleep();

  expect(onEnd).toBeCalledWith(output, session);
});

test('send message as bot', () => {
  const customRule = { delay: 1000 };
  const onTalk = jest.fn();

  const bot = new YveBot([], OPTS)
    .on('talk', onTalk)
    .start();
  bot.talk('Hi');
  bot.talk('Bye', customRule);
  expect(onTalk).toHaveBeenCalledTimes(2);
  expect(onTalk).toBeCalledWith('Hi', {}, 'session');
  expect(onTalk).toBeCalledWith('Bye', customRule, 'session');
});

test('using session', () => {
  const session = faker.random.number();
  const bot = new YveBot([{ message: 'OK' }], OPTS);
  const rules = bot.rules;
  const store = bot.store.get();
  bot.session(session);
  expect(bot.sessionId).toBe(session);
  expect(bot.store.get()).toEqual(store);
  expect(bot.rules).toEqual(rules);
});

test('using session with custom context/store/rules', () => {
  const session = faker.random.number();
  const newRules = [mocks.Rule()];
  const newContext = { user: 123 };
  const newStore = {
    context: newContext,
    currentIdx: faker.random.number(),
    output: { color: faker.commerce.color() },
    waitingForAnswer: true,
  };
  const bot = new YveBot([], OPTS);
  bot.session(session, {
    context: newContext,
    rules: newRules,
    store: newStore,
  });
  expect(bot.sessionId).toBe(session);
  expect(bot.store.get()).toEqual(newStore);
  expect(bot.rules).toHaveLength(1);
  expect(bot.rules[0].message).toBe(newRules[0].message);
  expect(bot.context.user).toBe(123);
});

test('addRules', async () => {
  const rules = loadYaml(`
  - message: Hello
  - message: Question
    type: String
    name: question
  - message: Bye
    name: bye
  `);
  const bot = new YveBot(rules, OPTS).start();

  expect(bot.controller.indexes).toEqual({
    bye: 2,
    question: 1,
  });
  expect(bot.rules).toHaveLength(3);
  expect(Object.keys(bot.controller.indexes)).toHaveLength(2);

  bot.addRules(loadYaml(`
  - message: Hello again!
  - message: Question 2
    type: String
    name: question2
  - message: Tchau!
    name: bye
  `));

  expect(bot.controller.indexes).toEqual({
    bye: 5,
    question: 1,
    question2: 4,
  });
  expect(bot.rules).toHaveLength(6);
  expect(Object.keys(bot.controller.indexes)).toHaveLength(3);
});

test('auto reply message', async () => {
  const onTalk = jest.fn();
  const rules = loadYaml(`
  - message: Color
    type: String
    replyMessage: Thanks
  `);
  const bot = new YveBot(rules, OPTS)
    .on('talk', onTalk)
    .start();

  await sleep();
  bot.hear('red');
  await sleep();

  expect(onTalk).toBeCalledWith('Color', rules[0], 'session');
  expect(onTalk).toBeCalledWith('Thanks', {}, 'session');
});

test('auto reply message with inherited delay', async () => {
  const onTalk = jest.fn();
  const rules = loadYaml(`
  - message: Color
    delay: 1234
    type: String
    replyMessage: Thanks
  `);
  const bot = new YveBot(rules, OPTS)
    .on('talk', onTalk)
    .start();

  await sleep();
  bot.hear('red');
  await sleep();

  expect(onTalk).toBeCalledWith('Thanks', { delay: 1234 }, 'session');
});

test('auto reply message for single choice', async () => {
  const onTalk = jest.fn();
  const rules = loadYaml(`
  - message: Color
    type: SingleChoice
    replyMessage: Nice color!
    options:
      - label: red
        replyMessage: Red! Nice!
      - label: white
        replyMessage: Really?
  `);
  const bot = new YveBot(rules, OPTS)
    .on('talk', onTalk)
    .start();

  await sleep();
  bot.hear('red');
  await sleep();

  expect(onTalk).toBeCalledWith('Color', rules[0], 'session');
  expect(onTalk).toBeCalledWith('Red! Nice!', {}, 'session');
  expect(onTalk).not.toBeCalledWith('Nice color!', {}, 'session');
  expect(onTalk).not.toBeCalledWith('Really?', {}, 'session');
});

test('auto reply message for multiple choice', async () => {
  const onTalk = jest.fn();
  const rules = loadYaml(`
  - message: Color
    type: MultipleChoice
    replyMessage: Nice color!
    options:
      - label: red
        replyMessage: Red! Nice!
      - label: white
        replyMessage: Really?
      - label: blue
        replyMessage: Nooo!
  `);
  const bot = new YveBot(rules, OPTS)
    .on('talk', onTalk)
    .start();

  await sleep();
  bot.hear('red, white');
  await sleep();

  expect(onTalk).toBeCalledWith('Color', rules[0], 'session');
  expect(onTalk).toBeCalledWith('Red! Nice!', {}, 'session');
  expect(onTalk).not.toBeCalledWith('Nice color!', {}, 'session');
  expect(onTalk).not.toBeCalledWith('Nooo!', {}, 'session');
  expect(onTalk).not.toBeCalledWith('Really?', {}, 'session');
});

test('compiled template', async () => {
  const onTalk = jest.fn();
  const rules = loadYaml(`
  - message: Color
    name: color
    type: String
    replyMessage: "Your color: {color} {color.invalid}"
  `);
  const bot = new YveBot(rules, OPTS)
    .on('talk', onTalk)
    .start();

  await sleep();
  bot.hear('red');
  await sleep();

  expect(onTalk).toBeCalledWith('Your color: red', {}, 'session');
});

test('compiled template with dot notation using single choice', async () => {
  const onTalk = jest.fn();
  const rules = loadYaml(`
  - message: Number
    name: number
    type: SingleChoice
    options:
      - label: One
        value: 1
      - label: Two
        value: 2
    replyMessage: "Your number: {number} ({number.label})"
  `);
  const bot = new YveBot(rules, OPTS)
    .on('talk', onTalk)
    .start();

  await sleep();
  bot.hear(1);
  await sleep();

  expect(onTalk).toBeCalledWith('Your number: 1 (One)', {}, 'session');
});

test('compiled template with dot notation using multiple choice', async () => {
  const onTalk = jest.fn();
  const rules = loadYaml(`
  - message: Number
    name: numbers
    type: MultipleChoice
    options:
      - label: One
        value: 1
      - label: Two
        value: 2
      - label: Three
        value: 3
    replyMessage: "Your numbers: {numbers.0.label}, {numbers.1.value} and {numbers.2}"
  `);
  const bot = new YveBot(rules, OPTS)
    .on('talk', onTalk)
    .start();

  await sleep();
  bot.hear([1, 2, 3]);
  await sleep();

  expect(onTalk).toBeCalledWith('Your numbers: One, 2 and 3', {}, 'session');
});

test('jumping to rule', async () => {
  const onTalk = jest.fn();
  const rules = loadYaml(`
  - message: Step 1
    next: three
  - message: Skipped
    name: two
  - message: Step 3
    name: three
  `);
  new YveBot(rules, OPTS)
    .on('talk', onTalk)
    .start();
  await sleep();

  expect(onTalk).not.toBeCalledWith('Skipped', rules[1], 'session');
  expect(onTalk).toBeCalledWith('Step 1', rules[0], 'session');
  expect(onTalk).toBeCalledWith('Step 3', rules[2], 'session');
  expect(onTalk).toHaveBeenCalledTimes(2);
});

test('jumping inside of flow', async () => {
  const onTalk = jest.fn();
  const flows = loadYaml(`
  - flow: welcome
    rules:
      - message: Hello
        next: okay
      - Skip
      - message: Okay
        name: okay
  `);
  new YveBot(flows, OPTS)
    .on('talk', onTalk)
    .start();
  await sleep();

  const flow = 'welcome';
  const { rules } = flows[0];
  expect(onTalk).not.toBeCalledWith('Skip', { flow, ...rules[1] }, 'session');
  expect(onTalk).toBeCalledWith('Hello', { flow, ...rules[0] }, 'session');
  expect(onTalk).toBeCalledWith('Okay', { flow, ...rules[2] }, 'session');
  expect(onTalk).toHaveBeenCalledTimes(2);
});

test('jumping between flows', async () => {
  const onTalk = jest.fn();
  const flows = loadYaml(`
  - flow: first
    rules:
      - message: Hello
        next: second.two
      - Skip 1
  - flow: second
    rules:
      - Skip 2
      - message: Here
        name: two
  `);
  new YveBot(flows, OPTS)
    .on('talk', onTalk)
    .start();
  await sleep();

  expect(onTalk).not.toBeCalledWith('Skip 1', { flow: 'first', ...flows[0].rules[1] }, 'session');
  expect(onTalk).not.toBeCalledWith('Skip 2', { flow: 'second', ...flows[1].rules[0] }, 'session');
  expect(onTalk).toBeCalledWith('Hello', { flow: 'first', ...flows[0].rules[0] }, 'session');
  expect(onTalk).toBeCalledWith('Here', { flow: 'second', ...flows[1].rules[1] }, 'session');
  expect(onTalk).toHaveBeenCalledTimes(2);
});

test('jumping to first rule of flow', async () => {
  const onTalk = jest.fn();
  const flows = loadYaml(`
  - flow: first
    rules:
      - message: Hello
        next: "flow:second"
  - flow: second
    rules:
      - message: Here
        name: two
  `);
  new YveBot(flows, OPTS)
    .on('talk', onTalk)
    .on('error', console.error)
    .start();
  await sleep();

  expect(onTalk).toBeCalledWith('Hello', { flow: 'first', ...flows[0].rules[0] }, 'session');
  expect(onTalk).toBeCalledWith('Here', { flow: 'second', ...flows[1].rules[0] }, 'session');
  expect(onTalk).toHaveBeenCalledTimes(2);
});

test('jumping to option next', async () => {
  const onTalk = jest.fn();
  const rules = loadYaml(`
  - message: Step 1
    type: SingleChoice
    options:
      - value: Jump
        next: three
  - message: Skipped
    name: two
  - message: Step 3
    name: three
  `);
  const bot = new YveBot(rules, OPTS)
    .on('talk', onTalk)
    .start();

  await sleep();
  bot.hear('Jump');
  await sleep();

  expect(onTalk).not.toBeCalledWith('Skipped', rules[1], 'session');
  expect(onTalk).toBeCalledWith('Step 1', rules[0], 'session');
  expect(onTalk).toBeCalledWith('Step 3', rules[2], 'session');
  expect(onTalk).toHaveBeenCalledTimes(2);
});

test('jumping to invalid rule', (done) => {
  const rules = loadYaml(`
  - message: Hello
    next: bye
  - U name?
  `);
  new YveBot(rules, OPTS)
    .on('error', (err) => {
      expect(err).toBeInstanceOf(RuleNotFound);
      done();
    })
    .start();
});

test('repeat ask on error validation', async () => {
  const onTalk = jest.fn();
  const rules = loadYaml(`
  - message: Tell me a number
    type: Number
  `);
  const bot = new YveBot(rules, OPTS)
    .on('talk', onTalk)
    .start();
  await sleep();
  expect(onTalk).toBeCalledWith('Tell me a number', rules[0], 'session');
  bot.hear('asdfg');
  await sleep();
  expect(onTalk).toBeCalledWith('Invalid number', rules[0], 'session');
  expect(onTalk).toHaveBeenCalledTimes(2);
});

test('warning message as function', async () => {
  const onTalk = jest.fn();
  const rules = loadYaml(`
  - message: Tell me a number
    type: Number
    validators:
      - max: 10
  `);
  const bot = new YveBot(rules, OPTS)
    .on('talk', onTalk)
    .start();
  await sleep();
  bot.hear(1000);
  await sleep();
  expect(onTalk).toBeCalledWith('This answer length must be max 10', rules[0], 'session');
});

test('bot sleeping', async () => {
  const onTalk = jest.fn();
  const onTyping = jest.fn();
  const onTyped = jest.fn();
  const rules = loadYaml(`
  - sleep: 5
  - message: Ok
    delay: 0
  `);
  new YveBot(rules)
    .on('talk', onTalk)
    .on('typing', onTyping)
    .on('typed', onTyped)
    .start();
  expect(onTalk).not.toBeCalled();
  expect(onTyping).not.toBeCalled();
  await sleep(10);
  expect(onTyping).toBeCalledWith('session');
  expect(onTyped).toBeCalledWith('session');
  expect(onTalk).toBeCalledWith('Ok', rules[1], 'session');
});

test('running actions', async () => {
  const act = jest.fn();
  const stringAct = jest.fn();
  const preAct = jest.fn();
  const postAct = jest.fn();
  const rules = loadYaml(`
  - message: Hello
    type: String
    actions:
      - testAction: false
      - unknown: 10
      - testStringWay
    preActions:
      - testPreAction: true
    postActions:
      - testPostAction: true
  `);
  const bot = new YveBot(rules, OPTS);
  bot.actions.define('testAction', act);
  bot.actions.define('testPreAction', preAct);
  bot.actions.define('testPostAction', postAct);
  bot.actions.define('testStringWay', stringAct);
  bot.start();

  await sleep();
  expect(act).toBeCalledWith(false, rules[0], bot);
  expect(stringAct).toBeCalledWith(true, rules[0], bot);
  expect(preAct).toBeCalledWith(true, rules[0], bot);
  expect(postAct).not.toBeCalled();

  bot.hear('okay');
  await sleep();
  expect(postAct).toBeCalledWith(true, rules[0], bot);
});

test('ruleTypes with multi executors', async () => {
  const rules = loadYaml(`
  - message: Hello
    name: testStep
    type: MultiStep
  `);
  const bot = new YveBot(rules, OPTS);
  const onEnd = jest.fn();
  bot.types.define('MultiStep', {
    executors: [{
      transform: async (answer) => `${answer} transformed`,
    }, {
      transform: async (answer) => `${answer} transformed2`,
    }],
  });

  bot.on('end', onEnd).start();
  await sleep();
  expect(bot.store.get('executors.testStep.currentIdx')).toEqual(undefined);
  bot.hear('answer');
  await sleep();
  expect(bot.store.get('executors.testStep.currentIdx')).toEqual(undefined);
  expect(bot.store.get('output.testStep')).toEqual('answer transformed transformed2');
  expect(onEnd).toHaveBeenCalledTimes(1);
});

test('ruleTypes with multi executors and waitForUserInput', async () => {
  const rules = loadYaml(`
  - message: Hello
    name: testStep2
    type: MultiStep2
  `);
  const bot = new YveBot(rules, OPTS);
  const onEnd = jest.fn();
  bot.types.define('MultiStep2', {
    executors: [
      {
        transform: async (answer) => `${answer} transformed`,
      },
      {
        transform: async (answer) => `${answer} transformed2`,
      },
      bot.executors.WaitForUserInput,
      {
        transform: async (answer) => `${answer} transformed3`,
      },
    ],
  });

  bot.on('end', onEnd).start();
  await sleep();
  expect(bot.store.get('executors.testStep2.currentIdx')).toEqual(undefined);
  bot.hear('first answer');
  await sleep();
  expect(bot.store.get('executors.testStep2.currentIdx')).toEqual(3);
  bot.hear('second answer');
  await sleep();
  expect(bot.store.get('executors.testStep2.currentIdx')).toEqual(undefined);
  expect(bot.store.get('output.testStep2')).toEqual('second answer transformed3');
  expect(onEnd).toHaveBeenCalledTimes(1);
});

test('transform answer', async () => {
  const rules = loadYaml(`
  - message: Enter
    name: value
    type: ValidTransform
  `);
  const onEnd = jest.fn();
  const bot = new YveBot(rules, OPTS);
  bot.types.define('ValidTransform', {
    executors: [{
      transform: async () => 'Transformed',
    }],
  });

  bot
    .on('end', onEnd)
    .start();

  await sleep();
  bot.hear('Original');
  await sleep();

  expect(onEnd).toBeCalledWith({ value: 'Transformed' }, 'session');
});

test('throw error on transform answer', async (done) => {
  const rules = loadYaml(`
  - message: Enter
    name: value
    type: InvalidTransform
  `);
  const onHear = jest.fn();
  const bot = new YveBot(rules, OPTS);
  const customError = new Error('Transform failed');
  bot.types.define('InvalidTransform', {
    executors: [{
      transform: async () => Promise.reject(customError),
    }],
  });

  bot
    .on('hear', onHear)
    .on('error', (err) => {
      expect(err).toEqual(customError);
      done();
    })
    .start();

  await sleep();
  bot.hear('Original');
});

test('calculate delay to type', async () => {
  const onTyped = jest.fn();
  const rules = loadYaml(`
  - message: .
  - message: A long message here
  `);
  new YveBot(rules)
    .on('typed', onTyped)
    .start();

  await sleep(calculateDelayToTypeMessage(rules[0].message, 40) + 10);
  expect(onTyped).toHaveBeenCalledTimes(1);

  await sleep(calculateDelayToTypeMessage(rules[1].message, 40) + 10);
  expect(onTyped).toHaveBeenCalledTimes(2);
});

test('do nothing when bot is not waiting for answer', async () => {
  const onTalk = jest.fn();
  const onHear = jest.fn();
  const bot = new YveBot([], OPTS)
    .on('talk', onTalk)
    .on('hear', onHear)
    .start();
  await sleep();
  bot.hear('Ok');
  await sleep();
  expect(onTalk).not.toBeCalled();
  expect(onHear).not.toBeCalled();
});

test('using default warning message as function', async () => {
  const onTalk = jest.fn();
  const rules = loadYaml(`
  - message: Exception on validate
    type: String
    validators:
      - defaultWarning  # string way
  `);
  const bot = new YveBot(rules, OPTS);
  bot.validators.define('defaultWarning', {
    validate: () => false,
    warning: () => null,
  });
  bot
    .on('talk', onTalk)
    .start();
  await sleep();
  bot.hear('ok');
  await sleep();
  expect(onTalk).toBeCalledWith('Invalid value for "String" type', rules[0], 'session');
});

test('passive mode: using Passive type', async () => {
  const listeners = [
    { includes: 'help', next: 'help' },
  ];
  const onTalk = jest.fn();
  const rules = loadYaml(`
  - type: Passive
  - Welcome
  - message: How can I help you?
    name: help
  `);
  const bot = new YveBot(rules, OPTS);
  bot.listen(listeners).on('talk', onTalk).start();
  await sleep();
  expect(onTalk).not.toHaveBeenCalled();
  bot.hear('help me');
  await sleep();
  expect(onTalk).toBeCalledWith('How can I help you?', rules[2], 'session');
});

test('passive mode: using unknown listener', async () => {
  const listeners = [
    { unknown: 'asd', next: 'help' },
  ];
  const onTalk = jest.fn();
  const rules = loadYaml(`- type: PassiveLoop`);
  const bot = new YveBot(rules, OPTS);
  bot.listen(listeners).on('talk', onTalk).start();
  await sleep();
  bot.hear('help me');
  await sleep();
  expect(onTalk).not.toHaveBeenCalled();
});

test('passive mode: skip Passive type when no matches', async () => {
  const listeners = [
    { includes: 'help', next: 'help' },
  ];
  const onTalk = jest.fn();
  const rules = loadYaml(`
  - type: Passive
  - message: Welcome
  - message: How can I help you?
    name: help
  `);
  const bot = new YveBot(rules, OPTS);
  bot.listen(listeners).on('talk', onTalk).start();
  await sleep();
  expect(onTalk).not.toHaveBeenCalled();
  bot.hear('Hi');
  await sleep();
  expect(onTalk).toBeCalledWith('Welcome', rules[1], 'session');
});

test('passive mode: enabled to all rules', async () => {
  const listeners = [
    { includes: 'help', next: 'help', passive: true },
  ];
  const onTalk = jest.fn();
  const rules = loadYaml(`
  - message: What's your name?
    name: name
    type: String
  - message: Thank you
  - message: How can I help you?
    name: help
  `);
  const bot = new YveBot(rules, OPTS);
  bot.listen(listeners).on('talk', onTalk).start();
  await sleep();
  bot.hear('help me');
  await sleep();
  expect(onTalk).toBeCalledWith('What\'s your name?', rules[0], 'session');
  expect(onTalk).toBeCalledWith('How can I help you?', rules[2], 'session');
  expect(onTalk).toHaveBeenCalledTimes(2);
  expect(bot.store.get('output.name')).toBeUndefined();
});

test('passive mode: disable for specific rule', async () => {
  const listeners = [
    { includes: 'help', next: 'help', passive: true },
  ];
  const onTalk = jest.fn();
  const rules = loadYaml(`
  - message: What's your name?
    name: name
    type: String
    passive: false
  - message: Thank you
    exit: true
  - message: How can I help you?
    name: help

  `);
  const bot = new YveBot(rules, OPTS);
  bot.listen(listeners).on('talk', onTalk).start();
  await sleep();
  bot.hear('help me');
  await sleep();
  expect(onTalk).toBeCalledWith('What\'s your name?', rules[0], 'session');
  expect(onTalk).toBeCalledWith('Thank you', rules[1], 'session');
  expect(onTalk).toHaveBeenCalledTimes(2);
  expect(bot.store.get('output.name')).toBe('help me');
});

test('passive mode: using PassiveLoop type', async () => {
  const listeners = [
    { includes: 'help', next: 'help' },
  ];
  const onTalk = jest.fn();
  const rules = loadYaml(`
  - type: PassiveLoop
  - Welcome
  - message: How can I help you?
    name: help
  `);
  const bot = new YveBot(rules, OPTS);
  bot.listen(listeners).on('talk', onTalk).start();
  await sleep();
  expect(onTalk).not.toHaveBeenCalled();
  bot.hear('hi');
  await sleep();
  expect(onTalk).not.toHaveBeenCalled();
  bot.hear('hello');
  await sleep();
  expect(onTalk).not.toHaveBeenCalled();
  bot.hear('help me');
  await sleep();
  expect(onTalk).toBeCalledWith('How can I help you?', rules[2], 'session');
});

test('throw error in warning message as function', async (done) => {
  const customError = new Error('Unknown in validator');
  const rules = loadYaml(`
  - message: Exception on validate
    type: String
    validators:
      - failed: true
  `);
  const bot = new YveBot(rules, OPTS);
  bot.validators.define('failed', {
    validate: () => false,
    warning: () => { throw customError; },
  });

  bot
    .on('error', (err) => {
      expect(err).toEqual(customError);
      done();
    })
    .start();

  await sleep();
  bot.hear('Ok');
});

test('throw error', (done) => {
  // throw as default
  const bot = new YveBot([]);
  expect(() => {
    bot.dispatch('error', new Error('Unknown'));
  }).toThrow(/Unknown/);

  // custom error
  new YveBot([{type: 'Unknown'}], OPTS)
    .on('error', (err) => {
      expect(err).toBeInstanceOf(InvalidAttributeError);
      done();
    })
    .start();
});
