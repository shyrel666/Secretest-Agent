package org.itstec.pay.filter;

import javax.servlet.ServletOutputStream;
import javax.servlet.WriteListener;
import javax.servlet.http.HttpServletResponse;
import javax.servlet.http.HttpServletResponseWrapper;
import java.io.ByteArrayOutputStream;
import java.io.IOException;

/**
 * author justin
 * description 加密返回
 * create 2022/9/18
 **/
public class ResponseWrapperUtil extends HttpServletResponseWrapper{
    private ByteArrayOutputStream buffer;
    private ServletOutputStream out;

    public ResponseWrapperUtil(HttpServletResponse httpServletResponse) {
        super(httpServletResponse);
        buffer = new ByteArrayOutputStream();
        out = new WrapperOutputStream(buffer);
    }

    @Override
    public ServletOutputStream getOutputStream() throws IOException {
        return out;
    }

    @Override
    public void flushBuffer() throws IOException {
        if (out != null) {
            out.flush();
        }
    }

    public byte[] getContent() throws IOException {
        flushBuffer();
        return buffer.toByteArray();
    }

    private static class WrapperOutputStream extends ServletOutputStream {
        private ByteArrayOutputStream bos;

        WrapperOutputStream(ByteArrayOutputStream bos) {
            this.bos = bos;
        }

        @Override
        public void write(int b)
                throws IOException {
            bos.write(b);
        }

        @Override
        public boolean isReady() {
            return false;

        }

        @Override
        public void setWriteListener(WriteListener arg0) {
        }
    }
}
