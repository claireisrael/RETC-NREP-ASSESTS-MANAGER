import { ORG_THEMES, resolveOrgTheme } from "../constants/org-branding.js";
import { resolveOrgCodeFromIdentifier } from "./org.js";

/**
 * Resolve email header name + brand colors from the requester's organisation.
 */
export function getEmailBrandingForOrg(orgIdentifier) {
  const code =
    resolveOrgCodeFromIdentifier(orgIdentifier) ||
    (typeof orgIdentifier === "string" && ORG_THEMES[orgIdentifier.toUpperCase()]
      ? orgIdentifier.toUpperCase()
      : null) ||
    "RETC";
  const theme = resolveOrgTheme(code);
  const colors = theme.colors || {};

  if (code === "NREP") {
    return {
      orgCode: "NREP",
      orgName: "National Renewable Energy Platform",
      brandColor: colors.primary || "#2E9ECC",
      accentColor: colors.accent || "#EFA74F",
      primaryDark: colors.primaryDark || "#357C9D",
    };
  }

  return {
    orgCode: "RETC",
    orgName: "Renewable Energy Training Center (RETC)",
    brandColor: colors.primary || "#059669",
    accentColor: colors.accent || "#2563eb",
    primaryDark: colors.primaryDark || "#047857",
  };
}

/**
 * Prefer request.orgId, then requester org fields, then explicit orgCode.
 */
export function resolveEmailBranding({
  orgId,
  orgCode,
  request,
  requester,
  branding,
} = {}) {
  if (branding?.orgName && branding?.brandColor) {
    return {
      ...getEmailBrandingForOrg(branding.orgCode || orgCode || orgId),
      ...branding,
    };
  }

  const identifier =
    orgCode ||
    orgId ||
    request?.orgId ||
    request?.orgCode ||
    requester?.orgCode ||
    requester?.orgId ||
    requester?.orgCodes?.[0] ||
    null;

  return getEmailBrandingForOrg(identifier);
}
