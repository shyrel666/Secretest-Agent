package org.itstec.common.crytodec;

import java.io.BufferedReader;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.Collections;
import java.util.Enumeration;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;

import javax.servlet.ReadListener;
import javax.servlet.ServletInputStream;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletRequestWrapper;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.util.Assert;
import org.springframework.util.StringUtils;


public class DecryptionRequestUtil extends HttpServletRequestWrapper{

    private Logger logger = LoggerFactory.getLogger(DecryptionRequestUtil.class);

    private static final String APPLICATION_JSON = "application/json";
    /**
     * 所有参数的Map集合
     */
    private Map<String, String[]> parameterMap;
    /**
     * 输入流
     */
    private InputStream inputStream;
    private final boolean valueValid = true;


    private String getRequestBody(HttpServletRequest req) {
        try {
            BufferedReader reader = req.getReader();
            StringBuffer sb = new StringBuffer();
            String line = null;
            while ((line = reader.readLine()) != null) {
                sb.append(line);
            }
            String json = sb.toString();
            return json;
        } catch (IOException e) {
            logger.info("请求体读取失败"+e.getMessage());
        }
        return "";
    }

    public DecryptionRequestUtil(HttpServletRequest request, String password) {
        super(request);

        String contentType = request.getHeader("Content-Type");

        if (contentType != null && contentType.contains(APPLICATION_JSON)) {
            //json
            String bodyStr = this.getRequestBody(request);
            logger.info("请求原报文:[{}]",bodyStr);
            if (StringUtils.isEmpty(bodyStr)){
                return;
            }
            bodyStr = AesUtil.decrypt(bodyStr, password);
            logger.info("解密后报文:[{}]",bodyStr);
            if (this.inputStream == null) {
                this.inputStream = new DecryptionInputStream(new ByteArrayInputStream(bodyStr.getBytes()));
            }
        } else {
            parameterMap = buildParams(request,password);
        }

    }

    private Map<String, String[]> buildParams(HttpServletRequest request,String password) {
        try{
            HashMap<String, String[]> newMap = new HashMap<>();
            for(Map.Entry<String, String[]> entry : request.getParameterMap().entrySet()){
                if("sign".equals(entry.getKey())){
                    newMap.put(entry.getKey(),entry.getValue());
                    continue;
                }
                logger.info("请求原报文:key=[{}],value=[{}]",entry.getKey(),entry.getValue()[0]);
                String[] temp = entry.getValue();
                temp[0] = AesUtil.decrypt(temp[0],password);
                logger.info("解密后报文:key=[{}],value=[{}]",entry.getKey(),temp[0]);
                newMap.put(entry.getKey(),temp);
            }
            return newMap;
        }catch (Exception e){
            logger.error("解密异常:",e);
            return null;
        }
    }

    @Override
    public String getParameter(String name) {
        String[] values = getParameterMap().get(name);
        if (valueValid){
            if (values != null) {
                return (values.length > 0 ? values[0] : null);
            }
            return super.getParameter(name);
        }else {
            return (values.length > 0 ? values[0] : null);
        }
    }

    @Override
    public String[] getParameterValues(String name) {
        String[] values = getParameterMap().get(name);

        if (valueValid){
            if (values != null) {
                return values;
            }
            return super.getParameterValues(name);
        }else {
            return values;
        }
    }

    @Override
    public Enumeration<String> getParameterNames() {
        Map<String, String[]> multipartParameters = getParameterMap();
        if (valueValid){
            if (multipartParameters.isEmpty()) {
                return super.getParameterNames();
            }
        }else {
            if (multipartParameters.isEmpty()) {
                return null;
            }
        }

        Set<String> paramNames = new LinkedHashSet<>();
        Enumeration<String> paramEnum = super.getParameterNames();
        while (paramEnum.hasMoreElements()) {
            paramNames.add(paramEnum.nextElement());
        }
        paramNames.addAll(multipartParameters.keySet());
        return Collections.enumeration(paramNames);
    }

    @Override
    public Map<String, String[]> getParameterMap() {
        if (valueValid){
            return parameterMap == null ? super.getParameterMap() : parameterMap;
        }else {
            return parameterMap == null ? new HashMap<>() : parameterMap;
        }
    }

    @Override
    public ServletInputStream getInputStream() throws IOException {
        if (valueValid){
            return this.inputStream == null ? super.getInputStream() : (ServletInputStream) this.inputStream;
        }else {
            return this.inputStream == null ? null : (ServletInputStream) this.inputStream;
        }
    }

    /**
     * 自定义ServletInputStream
     */
    private class DecryptionInputStream extends ServletInputStream {

        private final InputStream sourceStream;

        public DecryptionInputStream(InputStream sourceStream) {
            Assert.notNull(sourceStream, "Source InputStream must not be null");
            this.sourceStream = sourceStream;
        }

        @Override
        public int read() throws IOException {
            return this.sourceStream.read();
        }

        @Override
        public void close() throws IOException {
            super.close();
            this.sourceStream.close();
        }

        @Override
        public boolean isFinished() {
            return false;
        }

        @Override
        public boolean isReady() {
            return false;
        }

        @Override
        public void setReadListener(ReadListener readListener) {

        }
    }
}
