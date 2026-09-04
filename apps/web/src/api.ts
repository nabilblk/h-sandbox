import { accountApi } from "./api-client/account";
import { apiKeysApi } from "./api-client/api-keys";
import { membersApi } from "./api-client/members";
import { sandboxesApi } from "./api-client/sandboxes";
import { settingsApi } from "./api-client/settings";
import { templatesApi } from "./api-client/templates";
import { usageApi } from "./api-client/usage";
import { vaultApi } from "./api-client/vault";

export const api = {
  ...accountApi,
  ...sandboxesApi,
  ...templatesApi,
  ...apiKeysApi,
  ...membersApi,
  ...usageApi,
  ...vaultApi,
  ...settingsApi
};
