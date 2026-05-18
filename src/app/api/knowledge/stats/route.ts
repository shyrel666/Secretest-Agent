import { NextResponse } from 'next/server';
import { getDocumentSections } from '@/lib/knowledge';
import type { StandardType } from '@/lib/standards';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export interface StandardClauseStats {
  categories: number;
  vulnerabilities: number;
  vulnerabilityTypes: string[];
}

const STANDARD_TYPES: StandardType[] = ['java', 'cpp', 'csharp'];

/**
 * 只保留 6.2.X 格式的漏洞主线章节，排除总则(5.x)、附录(A.x)等非漏洞章节
 */
function isVulnerabilitySection(clauseNumber: string): boolean {
  return /^6\.2\.\d+$/.test(clauseNumber);
}

export async function GET() {
  try {
    const stats: Record<string, StandardClauseStats | null> = {};

    for (const type of STANDARD_TYPES) {
      const sections = getDocumentSections(type);
      const vulnSections = sections.filter((s) => isVulnerabilitySection(s.clauseNumber));
      if (vulnSections.length === 0) {
        stats[type] = null;
      } else {
        const allChildTitles: string[] = [];
        const vulnerabilities = vulnSections.reduce(
          (sum, section) => {
            allChildTitles.push(...section.childTitles.filter((t) => t && t.length > 2));
            return sum + section.childClauses.length;
          },
          0,
        );
        stats[type] = {
          categories: vulnSections.length,
          vulnerabilities,
          vulnerabilityTypes: [...new Set(allChildTitles)],
        };
      }
    }

    return NextResponse.json({ success: true, stats });
  } catch (error) {
    console.error('Knowledge stats API error:', error);
    return NextResponse.json(
      { success: false, error: '获取知识库统计失败' },
      { status: 500 },
    );
  }
}
