import { NextRequest, NextResponse } from 'next/server';
import { listDocuments, deleteDocument } from '@/lib/knowledge';
import { invalidateLessonCache } from '@/lib/learning/lesson-cache';

/**
 * GET /api/knowledge/documents — 列出已导入文档
 */
export async function GET() {
  try {
    const docs = await listDocuments();
    return NextResponse.json({ success: true, documents: docs });
  } catch (error) {
    console.error('List documents error:', error);
    return NextResponse.json(
      { error: '获取文档列表失败' },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/knowledge/documents?id=xxx — 删除指定文档
 */
export async function DELETE(request: NextRequest) {
  try {
    const docId = request.nextUrl.searchParams.get('id');
    if (!docId) {
      return NextResponse.json(
        { error: '请提供文档 ID' },
        { status: 400 },
      );
    }

    const result = await deleteDocument(docId);
    if (result.success) {
      invalidateLessonCache();
      return NextResponse.json({ success: true });
    }

    return NextResponse.json(
      { error: '文档不存在或删除失败' },
      { status: 404 },
    );
  } catch (error) {
    console.error('Delete document error:', error);
    return NextResponse.json(
      { error: '删除文档失败' },
      { status: 500 },
    );
  }
}
