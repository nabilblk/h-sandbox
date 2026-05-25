export type OidcProviderConfig = {
  issuer: string;
  jwksUrl: string;
  clientId?: string;
  audience?: string;
  issuerAllowlist?: string[];
  emailClaim?: string;
  nameClaim?: string;
  subjectClaim?: string;
};

export type OidcUserProfile = {
  subject: string;
  email: string;
  name: string;
  issuer: string;
  claims: Record<string, unknown>;
};

export interface OidcVerifier {
  readonly config: OidcProviderConfig;

  verifyToken(token: string): Promise<OidcUserProfile | null>;
}
