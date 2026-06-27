package org.itstec.filter;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;
import java.util.Properties;

import javax.servlet.Filter;
import javax.servlet.FilterChain;
import javax.servlet.ServletException;
import javax.servlet.ServletRequest;
import javax.servlet.ServletResponse;
import javax.servlet.annotation.WebFilter;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;

import org.itstec.common.SortUtil;
import org.itstec.common.security.AESUtil;
import org.itstec.common.security.MDUtil;
import org.itstec.common.security.RSAUtil;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.annotation.Order;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;

//@Component
@Order(1)
@WebFilter(urlPatterns = {"/doctor/*","/user/*","/report/*","/admin/*"})
public class CryptoFilter implements Filter {

	private static Logger logger = LoggerFactory.getLogger(CryptoFilter.class);
	
    private ObjectMapper objectMapper = new ObjectMapper();

    @SuppressWarnings("unchecked")
	@Override
    public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain) throws IOException, ServletException {
        
        HttpServletRequest httpRequest = (HttpServletRequest) request;
        
        Map<String, Object> errorData = new HashMap<>();
    	errorData.put("data", "filter error");
    	byte[] jsonData = objectMapper.writeValueAsBytes(errorData);
    	
        String requestBody = getRequestBody(httpRequest);
        Map<String, Object> requestBodyMap = objectMapper.readValue(requestBody, Map.class);
        String sign = "";
        String encryptedData = (String) requestBodyMap.get("data");
        String encryptedKey = (String) requestBodyMap.get("key");

        String key = "";
        String data = "";
        Properties prop = new Properties();
		InputStream input = RSAUtil.class.getClassLoader().getResourceAsStream("config.properties");
        prop.load(input);
        input.close();
		try {
            String privkey = prop.getProperty("privkey");
            key = RSAUtil.decrypt(encryptedKey, privkey);
            data = AESUtil.decrypt(encryptedData, key);
        }catch(Exception e) {
        	response.getOutputStream().write(jsonData);
        	return;
        }
		
		HashMap<String, Object> dataMap = (HashMap<String, Object>) jsonToMap(data);
		sign = (String) dataMap.get("sign");
		dataMap.remove("sign");
		data = SortUtil.mapToStrBySort(dataMap);
		String digest = MDUtil.mdHash(data,"");
		
		boolean verify = false;
		try {
            String publkey = prop.getProperty("signPublkey");
            verify = RSAUtil.verify(digest, sign, publkey);
        }catch(Exception e) {
        	response.getOutputStream().write(jsonData);
        	return;
        }

        if(verify) {
            request.setAttribute("decryptedData", dataMap);
        }else {
        	response.getOutputStream().write(jsonData);
        	return;
        }
        
        CustomResponseWrapper responseWrapper = new CustomResponseWrapper((HttpServletResponse) response);
        chain.doFilter(request, responseWrapper);
        byte[] busiData = responseWrapper.getDataStream();
        
        if (busiData.length > 0) {
        	HashMap<String, Object> originalData = (HashMap<String, Object>)objectMapper.readValue(busiData, Map.class);
            String jsonStr ="";
            try {
            	jsonStr = SortUtil.mapToStrBySort(originalData);
            	digest = MDUtil.mdHash(jsonStr,"");
                String privkey = prop.getProperty("signPrivkey");
                sign = RSAUtil.sign(digest, privkey);
                originalData.put("sign", sign);
                jsonStr = mapToJson(originalData);
                
                key = AESUtil.generateKey();
                String publkey = prop.getProperty("publkey");
                encryptedKey = RSAUtil.encrypt(key, publkey);
                encryptedData = AESUtil.encrypt(jsonStr, key);
                
			} catch (Exception e) {
				response.getOutputStream().write(jsonData);
	        	return;
			}
            Map<String, Object> newData = new HashMap<>();

            newData.put("data", encryptedData);
            newData.put("key", encryptedKey); 

            jsonData = objectMapper.writeValueAsBytes(newData);
            response.getOutputStream().write(jsonData);
        } else {
        	jsonData = objectMapper.writeValueAsBytes(errorData);
            response.getOutputStream().write(jsonData);
        }
        
    }
    
    private String getRequestBody(HttpServletRequest request) throws IOException {
        StringBuilder sb = new StringBuilder();
        try {
        	String line;
            BufferedReader reader = request.getReader();
            int bufferSize = 0;
            while ((line = reader.readLine()) != null) {
                sb.append(line);
                bufferSize += line.length();
                if (bufferSize > 100000000 ) {
                    throw new Exception("Request is too long");
                }
            }
        }catch(Exception e) {
        	logger.error("请求体读取失败");
        }
        return sb.toString();
    }
    
    public static String mapToJson(Map<String, Object> map) throws JsonProcessingException {
        ObjectMapper objectMapper = new ObjectMapper();
        return objectMapper.writeValueAsString(map);
    }
    
    @SuppressWarnings("unchecked")
	public static Map<String, Object> jsonToMap(String json) throws IOException {
        ObjectMapper objectMapper = new ObjectMapper();
        return objectMapper.readValue(json, Map.class);
    }
    
}
