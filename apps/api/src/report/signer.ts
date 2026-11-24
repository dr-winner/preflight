/**
 * Report signing lives in `@preflight/checks`.
 * This module re-exports that implementation so the API does not keep a second
 * JCS or EIP-191 path.
 */
export {
  createEip191ReportSigner,
  type ReportSigner,
  type UnsignedReport,
} from "@preflight/checks";
