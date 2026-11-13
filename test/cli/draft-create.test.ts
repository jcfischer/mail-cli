/**
 * TDD Tests: Draft Create CLI Command
 * T-3.1: email draft create command
 */

import { describe, it, expect } from 'bun:test';
import { createDraftCommand } from '../../src/commands/draft';

describe('createDraftCommand()', () => {
  it('should return a Commander command', () => {
    const command = createDraftCommand();
    expect(command).toBeDefined();
    expect(command.name()).toBe('draft');
  });

  it('should have "create" subcommand', () => {
    const command = createDraftCommand();
    const createCmd = command.commands.find(cmd => cmd.name() === 'create');
    expect(createCmd).toBeDefined();
  });

  it('should have required --to option', () => {
    const command = createDraftCommand();
    const createCmd = command.commands.find(cmd => cmd.name() === 'create');
    const toOption = createCmd?.options.find(opt => opt.flags.includes('--to'));
    expect(toOption).toBeDefined();
    expect(toOption?.required).toBe(true);
  });

  it('should have required --subject option', () => {
    const command = createDraftCommand();
    const createCmd = command.commands.find(cmd => cmd.name() === 'create');
    const subjectOption = createCmd?.options.find(opt => opt.flags.includes('--subject'));
    expect(subjectOption).toBeDefined();
    expect(subjectOption?.required).toBe(true);
  });

  it('should have optional --cc option', () => {
    const command = createDraftCommand();
    const createCmd = command.commands.find(cmd => cmd.name() === 'create');
    const ccOption = createCmd?.options.find(opt => opt.flags.includes('--cc'));
    expect(ccOption).toBeDefined();
  });

  it('should have optional --bcc option', () => {
    const command = createDraftCommand();
    const createCmd = command.commands.find(cmd => cmd.name() === 'create');
    const bccOption = createCmd?.options.find(opt => opt.flags.includes('--bcc'));
    expect(bccOption).toBeDefined();
  });

  it('should have optional --body option', () => {
    const command = createDraftCommand();
    const createCmd = command.commands.find(cmd => cmd.name() === 'create');
    const bodyOption = createCmd?.options.find(opt => opt.flags.includes('--body'));
    expect(bodyOption).toBeDefined();
  });

  it('should have optional --file option for body from file', () => {
    const command = createDraftCommand();
    const createCmd = command.commands.find(cmd => cmd.name() === 'create');
    const fileOption = createCmd?.options.find(opt => opt.flags.includes('--file'));
    expect(fileOption).toBeDefined();
  });

  it('should have optional --account option', () => {
    const command = createDraftCommand();
    const createCmd = command.commands.find(cmd => cmd.name() === 'create');
    const accountOption = createCmd?.options.find(opt => opt.flags.includes('--account'));
    expect(accountOption).toBeDefined();
  });

  it('should have optional --no-markdown option', () => {
    const command = createDraftCommand();
    const createCmd = command.commands.find(cmd => cmd.name() === 'create');
    const markdownOption = createCmd?.options.find(opt => opt.flags.includes('--no-markdown'));
    expect(markdownOption).toBeDefined();
  });

  it('should have optional --output option for JSON mode', () => {
    const command = createDraftCommand();
    const createCmd = command.commands.find(cmd => cmd.name() === 'create');
    const outputOption = createCmd?.options.find(opt => opt.flags.includes('--output'));
    expect(outputOption).toBeDefined();
  });

  it('should have optional --attachment option', () => {
    const command = createDraftCommand();
    const createCmd = command.commands.find(cmd => cmd.name() === 'create');
    const attachmentOption = createCmd?.options.find(opt => opt.flags.includes('--attachment'));
    expect(attachmentOption).toBeDefined();
  });

  it('should have optional --in-reply-to option', () => {
    const command = createDraftCommand();
    const createCmd = command.commands.find(cmd => cmd.name() === 'create');
    const replyOption = createCmd?.options.find(opt => opt.flags.includes('--in-reply-to'));
    expect(replyOption).toBeDefined();
  });
});
