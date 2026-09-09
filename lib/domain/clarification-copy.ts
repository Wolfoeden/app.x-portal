const GENERIC_SAP_ROLE = /\bSAP[- ]?(?:Berater(?:in)?|Consultant)\b/iu;
const SAP_SPECIALIZATION =
  /\b(?:S\/?4HANA|ABAP|Basis|BTP|BW|FI(?:\/CO)?|CO|HCM|MM|PP|SCM|SD|SuccessFactors|EWM|Ariba)\b/iu;

export function domainClarificationCopy(request: string): string | null {
  if (GENERIC_SAP_ROLE.test(request) && !SAP_SPECIALIZATION.test(request)) {
    return "Welche SAP-Spezialisierung ist für das Projekt entscheidend – zum Beispiel FI/CO, MM, SD, PP, HCM, Basis, ABAP oder S/4HANA? Die Rolle als SAP-Berater ist bereits verstanden; bis zur Präzisierung bleibt das Modul offen.";
  }
  return null;
}
