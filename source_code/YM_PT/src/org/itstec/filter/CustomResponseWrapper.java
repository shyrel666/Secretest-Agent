package org.itstec.filter;

import javax.servlet.ServletOutputStream;
import javax.servlet.http.HttpServletResponse;
import javax.servlet.http.HttpServletResponseWrapper;
import java.io.ByteArrayOutputStream;
import java.io.IOException;

public class CustomResponseWrapper extends HttpServletResponseWrapper {

    private ByteArrayOutputStream buffer = null;
    private ServletOutputStream out = null;

    public CustomResponseWrapper(HttpServletResponse resp) throws IOException {
        super(resp);
        buffer = new ByteArrayOutputStream();
        out = new CustomServletOutputStream(buffer);
    }

    @Override
    public ServletOutputStream getOutputStream() throws IOException {
        return out;
    }

    public byte[] getDataStream() {
        return buffer.toByteArray();
    }

    private class CustomServletOutputStream extends ServletOutputStream {
        private ByteArrayOutputStream buffer;

        public CustomServletOutputStream(ByteArrayOutputStream buffer) {
            this.buffer = buffer;
        }

        @Override
        public void write(int b) throws IOException {
            buffer.write(b);
        }

        @Override
        public boolean isReady() {
            return true;
        }

        @Override
        public void setWriteListener(javax.servlet.WriteListener listener) {
            // Not implemented
        }
    }
}
