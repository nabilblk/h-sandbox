import type { Command } from "commander";
import { initBanner, shouldUseColor } from "../format.js";

export const registerConfigCommands = (program: Command) => {
  program
    .command("init")
    .description("Print the Harakiri terminal banner")
    .action(() => {
      console.log(initBanner(shouldUseColor()));
    });
};
