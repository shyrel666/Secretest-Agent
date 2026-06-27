package org.itstec.user.service.impl;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileNotFoundException;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Date;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpSession;

import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.itstec.base.db.DBBeanBase;
import org.itstec.base.util.PassUtil;
import org.itstec.base.util.Poi4Util;
import org.itstec.base.util.SecurityUtil;
import org.itstec.common.crytodec.SM2Util;
import org.itstec.common.result.R;
import org.itstec.user.entity.User;
import org.itstec.user.mapper.UserMapper;
import org.itstec.user.service.UserService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.monitorjbl.xlsx.StreamingReader;

@Service
public class UserServiceImpl implements UserService {

	private Logger logger = LoggerFactory.getLogger(UserServiceImpl.class);

	@Autowired
	private UserMapper userMapper;

	@Override
	public R<?> register(HttpServletRequest request, User user) {
		String password = user.getPassword();
		if (StringUtils.isEmpty(user.getUsername())) {
			logger.info("用户名为空");
			return R.code("201", "用户名为空");
		}
		if("0".equals(PassUtil.checkPwd(password))){
			logger.info("密码校验未通过");
			return R.code("202", "密码校验未通过");
		}
		HttpSession session = request.getSession();
		QueryWrapper<User> queryWrapper = new QueryWrapper<>();
		queryWrapper.lambda().eq(User::getUsername, user.getUsername());
		User userDB = userMapper.selectOne(queryWrapper);
		if (userDB != null) {
			return R.code("203", "用户已存在");
		}
		
		String enPassword = SM2Util.encrypt("DwOIBxtP",password);
		user.setPassword(enPassword);
		user.setRegisterTime(new Date());
		userMapper.insert(user);
		session.setAttribute(String.valueOf(user.getId()), user);

		return R.code("200", "注册成功");
	}

	@Override
	public R<?> login(HttpServletRequest request, String username, String password) {
		QueryWrapper<User> queryWrapper = new QueryWrapper<>();
		queryWrapper.lambda().eq(User::getUsername, username);
		HttpSession session = request.getSession();
		session.setMaxInactiveInterval(-1);
		User user = userMapper.selectOne(queryWrapper);
		if (user == null) {
			logger.info("用户名：[{}]，不存在，登录失败!", username);
			return R.code("201", "用户名不存在，登录失败!");
		}else {
			password = SM2Util.encrypt("DwOIBxtP",password);
			session = request.getSession(true);
			session.setAttribute(String.valueOf(user.getId()), user);
			if(!user.getPassword().equals(password)){
				logger.info("用户名：[{}]，密码不正确，登录失败!", username);
				return R.code("202", "密码不正确，登录失败!");
			}else{
				logger.info("用户名：[{}]，登录成功!", username);
			}

		}		
		session.setAttribute(String.valueOf(user.getId()), user);
		return R.data(user);
	}
	
	@Override
	public String loginAutoRedi(HttpServletRequest request, String username, String password, String url){
		String newUrl = "/login/error";
		QueryWrapper<User> queryWrapper = new QueryWrapper<>();
		queryWrapper.lambda().eq(User::getUsername, username);
		HttpSession session = request.getSession();
		User user = userMapper.selectOne(queryWrapper);
		if (user == null) {
			logger.info("用户名：[{}]，不存在，登录失败!", username);
			newUrl = "/login/fail";
		}else {
			password = SM2Util.encrypt("DwOIBxtP",password);
			session = request.getSession(true);
			session.setAttribute(String.valueOf(user.getId()), user);
			if(!user.getPassword().equals(password)){
				logger.info("用户名：[{}]，密码不正确，登录失败!", username);
				newUrl = "/login/fail";
			}else{
				session.setAttribute(String.valueOf(user.getId()), user);
				newUrl=url;
			}
		}
		return newUrl;
	}

	@Override
	public R<?> logout(HttpServletRequest request, String username) {
		HttpSession session = request.getSession();
		session.removeAttribute(username);
		return R.code("200", "退出成功");
	}

	@Override
	public R<?> query(HttpServletRequest request, String username) {
		QueryWrapper<User> queryWrapper = new QueryWrapper<>();
		queryWrapper.lambda().eq(User::getUsername, username);
		User user = userMapper.selectOne(queryWrapper);
		if (user == null) {
			logger.info("用户名：[{}]，不存在，查询失败!", username);
			return R.code("201", "用户名不存在，查询失败!");
		}
		return R.data(user);
	}

	@Override
	public R<?> updateInfo(User user) {
		QueryWrapper<User> queryWrapper = new QueryWrapper<>();
		queryWrapper.lambda().eq(User::getId, user.getId());
		User userDB = userMapper.selectOne(queryWrapper);
		if (userDB == null) {
			return R.code("202", "用户不存在");
		}else{
			userMapper.updateById(user);
		}		
		return R.code("200", "用户信息更新");
	}

	@Override
	public R<?> uploadImg(MultipartFile multifile, String username) {
		String UPLOADED_FOLDER = "/itstec/tmp/";
		
		if (multifile.isEmpty()) {
            return R.data("Please select a file to upload");
        }

        String fileName = multifile.getOriginalFilename();
        String Suffix = fileName.substring(fileName.lastIndexOf(".")); 
        String mimeType = multifile.getContentType(); 
        String filePath = UPLOADED_FOLDER + fileName;

        String[] picSuffixList = {".jpg", ".png", ".jpeg", ".gif", ".bmp", ".ico"};
        boolean suffixFlag = false;
        for (String white_suffix : picSuffixList) {
            if (Suffix.toLowerCase().equals(white_suffix)) {
                suffixFlag = true;
                break;
            }
        }
        if (!suffixFlag) {
            logger.error("[-] Suffix error: " + Suffix);
            deleteFile(filePath);
            return R.data("Upload failed. Illeagl picture.");
        }

        String[] mimeTypeBlackList = {
                "text/html",
                "text/javascript",
                "application/javascript",
                "application/ecmascript",
                "text/xml",
                "application/xml"
        };
        for (String blackMimeType : mimeTypeBlackList) {
            if (SecurityUtil.replaceSpecialStr(mimeType).toLowerCase().contains(blackMimeType)) {
                logger.error("[-] Mime type error: " + mimeType);
                deleteFile(filePath);
                return R.data("Upload failed. Illeagl picture.");
            }
        }

        try {
            byte[] bytes = multifile.getBytes();
            Path path = Paths.get(UPLOADED_FOLDER + multifile.getOriginalFilename());
            Files.write(path, bytes);
        } catch (IOException e) {
            logger.error(e.toString());
            deleteFile(filePath);
            return R.data("Upload failed");
        }

        logger.info("[+] Safe file. Suffix: {}, MIME: {}", Suffix, mimeType);
        logger.info("[+] Successfully uploaded {}", filePath);
		return R.data("图片上传成功");
	}
	
	private void deleteFile(String filePath) {
        File delFile = new File(filePath);
        if(delFile.isFile() && delFile.exists()) {
            if (delFile.delete()) {
                logger.info("[+] " + filePath + " delete successfully!");
                return;
            }
        }
        logger.info(filePath + " delete failed!");
    }

	@Override
	public int updateBatchInfo(File excel) {
		int t = 0;

		Poi4Util poi;
		FileInputStream is;

		String[] colum = new String[] { "id","username","mobilephone", "email", "delivery_address" };
		String update = "update user ";
		String set = "";
		String where = "where ";
		String tmp = "";
		DBBeanBase dbbean = new DBBeanBase(true);
		try {
			is = new FileInputStream(excel.getAbsolutePath());
			
			poi = new Poi4Util(is, "xlsx", "Sheet1");

			for (int i = 1; i < 10000; i++) {
				if ("".equals(poi.getCellStringValue(i, 1))) {
					break;
				}
				set = "set ";
				where = "";
				for (int j = 2; j <= 4; j++) {
					if ("rgb(146,208,80)".equals(poi.getCellBackgroundColor(i, j))
							|| "rgb(146,208,79)".equals(poi.getCellBackgroundColor(i, j))) {
						try {
							tmp = poi.getCellDateValue(i, j);
						} catch (java.lang.IllegalStateException e) {
							tmp = poi.getCellStringValue(i, j);
						}
						set = set + " " + colum[j] + "='" + tmp + "',";
					}
				}
				if (!"set ".equals(set)) {
					set = set.substring(0, set.length() - 1) + " ";
					where = "where id=" + poi.getCellNumberValue(i, 0);
					int j=dbbean.executeUpdate(update + set + where);
					if(j>0){
						t++;
					}
				}
			}
			dbbean.close();
		} catch (FileNotFoundException e) {
			logger.error("文件异常" + e);
			e.printStackTrace();
		} catch (IOException e) {
			logger.error("IO异常" + e);
			e.printStackTrace();
		} catch (Exception e) {
			logger.error("执行sql执行异常" + e);
			dbbean.rollback();
		} 

		return t;
	}

	@Override
	public int importBatchInfo(File excel, int memorySize) {
		int insRows=0;
		String values="";
		DBBeanBase dbbean = new DBBeanBase();
		try {
			String[] colum = new String[] { "username","password","mobilephone","email","delivery_address" };
			List<Map<String, Object>> datas = readBigExcel(excel.getAbsolutePath(),
					"username,password,mobilephone,email,delivery_address","Sheet1",1,0,memorySize);
			String insert = "insert into user (username,password,mobilephone,email,delivery_address) values (";
			for(int i=0;i<datas.size();i++){
				values="";
				for(int j=0;j<colum.length;j++){
					values=values+"'"+datas.get(i).get(colum[j])+"',";
				}
				values=values.substring(0,values.length()-1)+")";
				//System.out.println(insert + values);
				int t=dbbean.executeUpdate(insert + values);
				if(t>0){
					insRows++;
				}
			}
		} catch (Exception e) {
			logger.error("导入异常" + e);
			return -1;
		} finally {
			dbbean.close();
		}
		return insRows;
	}
	
	private static List<Map<String, Object>> readBigExcel(String excel, String rowname, String stasheetName,
			int starowNum, int stacolumn, int memorySize) throws Exception {
		List<Map<String, Object>> resultList = new ArrayList<Map<String, Object>>();
		InputStream inputStream = new FileInputStream(excel);
		try (Workbook wk = StreamingReader.builder().rowCacheSize(1000) 
				.bufferSize(memorySize) 
				.open(inputStream);) { 
			Sheet sheet = wk.getSheet(stasheetName);
			String[] rownameSplit = rowname.split(",");
			int columnlength = rownameSplit.length;
			Cell cell = null;
			for (Row row : sheet) {
				Map<String, Object> paramMap = new HashMap<String, Object>();
				if (row.getRowNum() >= starowNum) {
					for (int j = stacolumn; j < columnlength; j++) {

						if (row != null) {
							cell = row.getCell(j);
							if (cell != null) {
								paramMap.put(rownameSplit[j], cell.getStringCellValue());
							} else {
								paramMap.put(rownameSplit[j], null);
							}

						}
					}
					resultList.add(paramMap);
				}
			}
		}
		return resultList;
	}

}
