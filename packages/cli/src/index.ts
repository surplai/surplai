#!/usr/bin/env node
import { Command } from "commander";
import { initCommand } from "./commands/init.js";
import { startCommand } from "./commands/start.js";
import { runCommand } from "./commands/run.js";

const program = new Command();

program
  .name("surplai")
  .description("Route unused AI resources to where they're needed most")
  .version("0.0.1");

program
  .command("init")
  .description("Configure surplai (backend, handle, server)")
  .action(initCommand);

program
  .command("start")
  .description("Start polling for tasks and contributing")
  .action(startCommand);

program
  .command("run <taskId>")
  .description("Run a single task by ID")
  .action(runCommand);

program.parse();
