import { sdkDemoTutorial } from './sdk-demo-walkthrough';
import { cliDemoTutorial } from './cli-demo-walkthrough';
import { uiDemoTutorial } from './ui-demo-walkthrough';
import { browserDemoTutorial } from './browser-demo-walkthrough';

export const agentDemoPrerequisites = 'Use your own Harakiri API URL and an organization-scoped API key. The organization must have a ready opencode template; an administrator can build the included opencode template first. These recordings used CLI/SDK 0.4.0, OpenCode 1.15.13, and opencode/mimo-v2.5-free on September 5, 2026. Free model availability and provider data policies can change. Use only synthetic data, explicitly select a free main and small model, and stop if the model is unavailable. There is no paid-model fallback.';

export const agentDemoTutorials = [cliDemoTutorial, uiDemoTutorial, sdkDemoTutorial, browserDemoTutorial];
