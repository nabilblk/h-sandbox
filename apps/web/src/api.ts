import { accountApi } from "./api-client/account";
import { apiKeysApi } from "./api-client/api-keys";
import { sandboxesApi } from "./api-client/sandboxes";
import { settingsApi } from "./api-client/settings";
import { templatesApi } from "./api-client/templates";
import { usageApi } from "./api-client/usage";

export const api = {
  ...accountApi,
  ...sandboxesApi,
  ...templatesApi,
  ...apiKeysApi,
  ...usageApi,
  ...settingsApi
};
