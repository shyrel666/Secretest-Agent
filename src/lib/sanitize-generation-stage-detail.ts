/** 出题进度文案脱敏：不向用户展示具体漏洞/条款名称 */
export function sanitizeGenerationStageDetail(detail: string): string {
  return detail
    .replace(/正在生成\s*(简单|中等|困难)题[：:][^…\n]+/g, '正在生成 $1难度候选题')
    .replace(/正在生成\s*(简单|中等|困难)题[：:].+/g, '正在生成 $1难度候选题…')
    .replace(/聚焦[：:\s][^，,…\n]+/g, '聚焦考点')
    .replace(/漏洞类型[：:\s][^，,…\n]+/g, '漏洞类型（已隐藏）');
}
