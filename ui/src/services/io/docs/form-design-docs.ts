import type { BehaviorTopicDocEntry } from './types';

export const formDesignCategories = ['基础控件', '选择控件', '容器控件', '展示控件'];

export const formDesignDocs: BehaviorTopicDocEntry[] = [
  // ─── 基础控件 ─────────────────────────────────────────────
  {
    id: 'form-design:input',
    slug: 'control-input',
    title: '文本输入',
    summary: '单行文本输入框，支持多种校验规则和样式自定义',
    sections: [
      {
        title: '属性说明',
        fields: [
          { name: 'label', type: 'string', description: '标签文本' },
          { name: 'name', type: 'string', description: '字段名，用于数据绑定' },
          { name: 'placeholder', type: 'string', description: '占位提示文字' },
          { name: 'required', type: 'boolean', description: '是否必填' },
          { name: 'readonly', type: 'boolean', description: '是否只读' },
          { name: 'disabled', type: 'boolean', description: '是否禁用' },
          { name: 'validator', type: 'select', description: '内置校验器：none/email/phone/url/idcard/pattern' },
          { name: 'pattern', type: 'string', description: '自定义正则表达式（validator 为 pattern 时生效）' },
          { name: 'minLength', type: 'number', description: '最小输入长度' },
          { name: 'maxLength', type: 'number', description: '最大输入长度' },
          { name: 'fontSize', type: 'number', description: '字号（10-48）' },
          { name: 'fontWeight', type: 'select', description: '字重：300/400/500/600/700' },
          { name: 'color', type: 'color', description: '文字颜色' },
          { name: 'textAlign', type: 'select', description: '对齐方式：left/center/right' },
          { name: 'rangeRef', type: 'range', description: '数据源引用' },
        ],
      },
      {
        title: '使用示例',
        body: '适用于姓名、标题、短文本等单行输入场景。可通过 validator 属性快速实现邮箱、手机号、URL 等格式校验，也可通过 pattern 属性自定义正则校验规则。',
      },
    ],
  },
  {
    id: 'form-design:textarea',
    slug: 'control-textarea',
    title: '多行文本',
    summary: '多行文本输入区域，支持自动调整高度和字数统计',
    sections: [
      {
        title: '属性说明',
        fields: [
          { name: 'label', type: 'string', description: '标签文本' },
          { name: 'name', type: 'string', description: '字段名，用于数据绑定' },
          { name: 'placeholder', type: 'string', description: '占位提示文字' },
          { name: 'rows', type: 'number', description: '可见行数（1-20）' },
          { name: 'required', type: 'boolean', description: '是否必填' },
          { name: 'readonly', type: 'boolean', description: '是否只读' },
          { name: 'disabled', type: 'boolean', description: '是否禁用' },
          { name: 'maxLength', type: 'number', description: '最大输入字数' },
          { name: 'showCount', type: 'boolean', description: '是否显示字数统计' },
          { name: 'autoResize', type: 'boolean', description: '是否根据内容自动调整高度' },
          { name: 'fontSize', type: 'number', description: '字号（10-48）' },
          { name: 'fontWeight', type: 'select', description: '字重：300/400/500/700' },
          { name: 'color', type: 'color', description: '文字颜色' },
          { name: 'lineHeight', type: 'number', description: '行高（1-3）' },
          { name: 'rangeRef', type: 'range', description: '数据源引用' },
        ],
      },
      {
        title: '使用示例',
        body: '适用于备注、描述、评论等需要多行文本输入的场景。设置 autoResize 为 true 可让输入框根据内容自动扩展高度，配合 maxLength 和 showCount 可限制并显示输入字数。',
      },
    ],
  },
  {
    id: 'form-design:number',
    slug: 'control-number',
    title: '数字输入',
    summary: '数字输入框，支持步长、精度、前缀后缀等数值控制',
    sections: [
      {
        title: '属性说明',
        fields: [
          { name: 'label', type: 'string', description: '标签文本' },
          { name: 'name', type: 'string', description: '字段名，用于数据绑定' },
          { name: 'placeholder', type: 'string', description: '占位提示文字' },
          { name: 'required', type: 'boolean', description: '是否必填' },
          { name: 'readonly', type: 'boolean', description: '是否只读' },
          { name: 'disabled', type: 'boolean', description: '是否禁用' },
          { name: 'integer', type: 'boolean', description: '是否仅允许整数' },
          { name: 'positive', type: 'boolean', description: '是否仅允许正数' },
          { name: 'min', type: 'number', description: '最小值' },
          { name: 'max', type: 'number', description: '最大值' },
          { name: 'step', type: 'number', description: '步长' },
          { name: 'precision', type: 'number', description: '小数位数（0-10）' },
          { name: 'prefix', type: 'string', description: '前缀文本，如 ¥' },
          { name: 'suffix', type: 'string', description: '后缀文本，如 元' },
          { name: 'rangeRef', type: 'range', description: '数据源引用' },
        ],
      },
      {
        title: '使用示例',
        body: '适用于数量、金额、百分比等数值输入场景。通过 min/max 控制数值范围，step 控制增减步长，precision 控制小数精度。prefix 和 suffix 可添加货币符号或单位。',
      },
    ],
  },
  {
    id: 'form-design:datePicker',
    slug: 'control-datePicker',
    title: '日期选择',
    summary: '日期选择器，支持多种日期格式和时间选择',
    sections: [
      {
        title: '属性说明',
        fields: [
          { name: 'label', type: 'string', description: '标签文本' },
          { name: 'name', type: 'string', description: '字段名，用于数据绑定' },
          { name: 'placeholder', type: 'string', description: '占位提示文字' },
          { name: 'required', type: 'boolean', description: '是否必填' },
          { name: 'readonly', type: 'boolean', description: '是否只读' },
          { name: 'disabled', type: 'boolean', description: '是否禁用' },
          { name: 'format', type: 'select', description: '日期格式：YYYY-MM-DD/YYYY/MM/DD 等' },
          { name: 'showTime', type: 'boolean', description: '是否同时选择时间' },
          { name: 'minDate', type: 'date', description: '可选最早日期' },
          { name: 'maxDate', type: 'date', description: '可选最晚日期' },
          { name: 'rangeRef', type: 'range', description: '数据源引用' },
        ],
      },
      {
        title: '使用示例',
        body: '适用于生日、创建日期、截止日期等日期选择场景。启用 showTime 后可同时选择时间，通过 minDate 和 maxDate 限制可选日期范围。',
      },
    ],
  },
  {
    id: 'form-design:timePicker',
    slug: 'control-timePicker',
    title: '时间选择',
    summary: '时间选择器，支持时分秒格式配置',
    sections: [
      {
        title: '属性说明',
        fields: [
          { name: 'label', type: 'string', description: '标签文本' },
          { name: 'name', type: 'string', description: '字段名，用于数据绑定' },
          { name: 'placeholder', type: 'string', description: '占位提示文字' },
          { name: 'required', type: 'boolean', description: '是否必填' },
          { name: 'readonly', type: 'boolean', description: '是否只读' },
          { name: 'disabled', type: 'boolean', description: '是否禁用' },
          { name: 'showSeconds', type: 'boolean', description: '是否显示秒' },
          { name: 'format', type: 'select', description: '时间格式：HH:mm 或 HH:mm:ss' },
          { name: 'rangeRef', type: 'range', description: '数据源引用' },
        ],
      },
      {
        title: '使用示例',
        body: '适用于会议时间、营业时间、预约时间等时间选择场景。默认显示时分，设置 showSeconds 为 true 可显示秒。',
      },
    ],
  },
  {
    id: 'form-design:dateRange',
    slug: 'control-dateRange',
    title: '日期范围',
    summary: '日期范围选择器，用于选择起止日期',
    sections: [
      {
        title: '属性说明',
        fields: [
          { name: 'label', type: 'string', description: '标签文本' },
          { name: 'name', type: 'string', description: '字段名，用于数据绑定' },
          { name: 'required', type: 'boolean', description: '是否必填' },
          { name: 'readonly', type: 'boolean', description: '是否只读' },
          { name: 'disabled', type: 'boolean', description: '是否禁用' },
          { name: 'startPlaceholder', type: 'string', description: '开始日期占位文字' },
          { name: 'endPlaceholder', type: 'string', description: '结束日期占位文字' },
          { name: 'format', type: 'select', description: '日期格式：YYYY-MM-DD/YYYY/MM/DD 等' },
          { name: 'rangeRef', type: 'range', description: '数据源引用' },
        ],
      },
      {
        title: '使用示例',
        body: '适用于出差日期、假期、项目周期等需要选择起止日期的场景。值为包含 start 和 end 的对象。',
      },
    ],
  },
  {
    id: 'form-design:switch',
    slug: 'control-switch',
    title: '开关',
    summary: '布尔开关控件，用于启用/禁用状态切换',
    sections: [
      {
        title: '属性说明',
        fields: [
          { name: 'label', type: 'string', description: '标签文本' },
          { name: 'name', type: 'string', description: '字段名，用于数据绑定' },
          { name: 'disabled', type: 'boolean', description: '是否禁用' },
          { name: 'defaultValue', type: 'boolean', description: '默认是否开启' },
          { name: 'size', type: 'select', description: '尺寸：small/default/large' },
          { name: 'activeColor', type: 'color', description: '开启状态颜色' },
          { name: 'inactiveColor', type: 'color', description: '关闭状态颜色' },
          { name: 'rangeRef', type: 'range', description: '数据源引用' },
        ],
      },
      {
        title: '使用示例',
        body: '适用于是否启用通知、是否公开、是否同意协议等二元选择场景。值为 true 或 false。',
      },
    ],
  },
  {
    id: 'form-design:rating',
    slug: 'control-rating',
    title: '评分',
    summary: '星级评分控件，支持半星和自定义最大值',
    sections: [
      {
        title: '属性说明',
        fields: [
          { name: 'label', type: 'string', description: '标签文本' },
          { name: 'name', type: 'string', description: '字段名，用于数据绑定' },
          { name: 'max', type: 'number', description: '最大分值（1-10）' },
          { name: 'defaultValue', type: 'number', description: '默认分值' },
          { name: 'disabled', type: 'boolean', description: '是否禁用' },
          { name: 'required', type: 'boolean', description: '是否必填' },
          { name: 'allowHalf', type: 'boolean', description: '是否允许半星' },
          { name: 'showText', type: 'boolean', description: '是否显示分值文本' },
          { name: 'activeColor', type: 'color', description: '激活颜色' },
          { name: 'inactiveColor', type: 'color', description: '未激活颜色' },
          { name: 'rangeRef', type: 'range', description: '数据源引用' },
        ],
      },
      {
        title: '使用示例',
        body: '适用于满意度评分、服务质量评价、产品评分等场景。通过 max 设置星级数量，allowHalf 允许半星评分，showText 显示数值。',
      },
    ],
  },
  {
    id: 'form-design:tagInput',
    slug: 'control-tagInput',
    title: '标签输入',
    summary: '标签输入控件，回车添加标签并支持删除',
    sections: [
      {
        title: '属性说明',
        fields: [
          { name: 'label', type: 'string', description: '标签文本' },
          { name: 'name', type: 'string', description: '字段名，用于数据绑定' },
          { name: 'placeholder', type: 'string', description: '占位提示文字' },
          { name: 'required', type: 'boolean', description: '是否必填' },
          { name: 'disabled', type: 'boolean', description: '是否禁用' },
          { name: 'rangeRef', type: 'range', description: '数据源引用' },
        ],
      },
      {
        title: '使用示例',
        body: '适用于关键词、标签、技能等多值输入场景。输入文字后按回车添加标签，点击标签可删除。值为字符串数组。',
      },
    ],
  },
  {
    id: 'form-design:upload',
    slug: 'control-upload',
    title: '文件上传',
    summary: '文件上传控件，支持多种文件类型',
    sections: [
      {
        title: '属性说明',
        fields: [
          { name: 'label', type: 'string', description: '标签文本' },
          { name: 'name', type: 'string', description: '字段名，用于数据绑定' },
          { name: 'placeholder', type: 'string', description: '占位提示文字' },
          { name: 'required', type: 'boolean', description: '是否必填' },
          { name: 'disabled', type: 'boolean', description: '是否禁用' },
          { name: 'rangeRef', type: 'range', description: '数据源引用' },
        ],
      },
      {
        title: '使用示例',
        body: '适用于合同、简历、附件等文件上传场景。值为包含 name、size、type、url 属性的文件对象数组。',
      },
    ],
  },
  {
    id: 'form-design:imageUpload',
    slug: 'control-imageUpload',
    title: '图片上传',
    summary: '图片上传控件，仅支持图片文件格式',
    sections: [
      {
        title: '属性说明',
        fields: [
          { name: 'label', type: 'string', description: '标签文本' },
          { name: 'name', type: 'string', description: '字段名，用于数据绑定' },
          { name: 'placeholder', type: 'string', description: '占位提示文字' },
          { name: 'required', type: 'boolean', description: '是否必填' },
          { name: 'disabled', type: 'boolean', description: '是否禁用' },
          { name: 'rangeRef', type: 'range', description: '数据源引用' },
        ],
      },
      {
        title: '使用示例',
        body: '适用于头像、证件照、商品图等图片上传场景。仅接受图片文件格式，值结构与文件上传相同。',
      },
    ],
  },
  {
    id: 'form-design:button',
    slug: 'control-button',
    title: '按钮',
    summary: '操作按钮控件，支持多种样式变体和加载状态',
    sections: [
      {
        title: '属性说明',
        fields: [
          { name: 'label', type: 'string', description: '按钮文本' },
          { name: 'name', type: 'string', description: '字段名' },
          { name: 'variant', type: 'select', description: '样式变体：primary/default/danger/ghost' },
          { name: 'disabled', type: 'boolean', description: '是否禁用' },
          { name: 'loading', type: 'boolean', description: '是否显示加载状态' },
          { name: 'icon', type: 'string', description: '图标（emoji）' },
          { name: 'fontSize', type: 'number', description: '字号（10-32）' },
          { name: 'fontWeight', type: 'select', description: '字重：400/500/600/700' },
          { name: 'color', type: 'color', description: '文字颜色' },
          { name: 'backgroundColor', type: 'color', description: '自定义背景色' },
          { name: 'borderRadius', type: 'number', description: '圆角（0-50）' },
          { name: 'fullWidth', type: 'boolean', description: '是否满宽显示' },
          { name: 'rangeRef', type: 'range', description: '数据源引用' },
        ],
      },
      {
        title: '使用示例',
        body: '适用于提交、取消、删除等操作场景。primary 为主要按钮，danger 为危险操作按钮，ghost 为幽灵按钮。支持 onClick 事件。',
      },
    ],
  },

  // ─── 选择控件 ─────────────────────────────────────────────
  {
    id: 'form-design:select',
    slug: 'control-select',
    title: '下拉选择',
    summary: '下拉选择器，支持单选和多选模式',
    sections: [
      {
        title: '属性说明',
        fields: [
          { name: 'label', type: 'string', description: '标签文本' },
          { name: 'name', type: 'string', description: '字段名，用于数据绑定' },
          { name: 'placeholder', type: 'string', description: '占位提示文字' },
          { name: 'required', type: 'boolean', description: '是否必填' },
          { name: 'readonly', type: 'boolean', description: '是否只读' },
          { name: 'disabled', type: 'boolean', description: '是否禁用' },
          { name: 'multiple', type: 'boolean', description: '是否多选' },
          { name: 'options', type: 'json', description: '选项列表，格式 [{label, value}]' },
          { name: 'rangeRef', type: 'range', description: '数据源引用' },
        ],
      },
      {
        title: '使用示例',
        body: '适用于城市选择、分类选择、状态选择等场景。通过 options 配置选项列表，multiple 为 true 时支持多选。单选值为字符串，多选值为字符串数组。',
      },
    ],
  },
  {
    id: 'form-design:segmented',
    slug: 'control-segmented',
    title: '分段选择',
    summary: '分段选择器，以分段控件形式展示选项',
    sections: [
      {
        title: '属性说明',
        fields: [
          { name: 'label', type: 'string', description: '标签文本' },
          { name: 'name', type: 'string', description: '字段名，用于数据绑定' },
          { name: 'required', type: 'boolean', description: '是否必填' },
          { name: 'disabled', type: 'boolean', description: '是否禁用' },
          { name: 'options', type: 'json', description: '选项列表，格式 [{label, value}]' },
          { name: 'rangeRef', type: 'range', description: '数据源引用' },
        ],
      },
      {
        title: '使用示例',
        body: '适用于状态切换、视图模式切换等场景。外观类似 iOS 分段控件，适合选项较少（2-5个）的单选场景。',
      },
    ],
  },
  {
    id: 'form-design:radio',
    slug: 'control-radio',
    title: '单选',
    summary: '单选按钮组，支持垂直和水平排列',
    sections: [
      {
        title: '属性说明',
        fields: [
          { name: 'label', type: 'string', description: '标签文本' },
          { name: 'name', type: 'string', description: '字段名，用于数据绑定' },
          { name: 'required', type: 'boolean', description: '是否必填' },
          { name: 'disabled', type: 'boolean', description: '是否禁用' },
          { name: 'options', type: 'json', description: '选项列表，格式 [{label, value}]' },
          { name: 'direction', type: 'select', description: '排列方向：vertical/horizontal' },
          { name: 'size', type: 'select', description: '控件尺寸：small/default/large' },
          { name: 'rangeRef', type: 'range', description: '数据源引用' },
        ],
      },
      {
        title: '使用示例',
        body: '适用于性别选择、支付方式选择等需要展示所有选项的单选场景。direction 控制排列方向，适合选项数量适中的场景。',
      },
    ],
  },
  {
    id: 'form-design:checkbox',
    slug: 'control-checkbox',
    title: '多选',
    summary: '多选复选框组，支持最少/最多选择数量限制',
    sections: [
      {
        title: '属性说明',
        fields: [
          { name: 'label', type: 'string', description: '标签文本' },
          { name: 'name', type: 'string', description: '字段名，用于数据绑定' },
          { name: 'required', type: 'boolean', description: '是否必填' },
          { name: 'disabled', type: 'boolean', description: '是否禁用' },
          { name: 'options', type: 'json', description: '选项列表，格式 [{label, value}]' },
          { name: 'direction', type: 'select', description: '排列方向：vertical/horizontal' },
          { name: 'minSelect', type: 'number', description: '最少选择数量' },
          { name: 'maxSelect', type: 'number', description: '最多选择数量（0 为不限）' },
          { name: 'size', type: 'select', description: '控件尺寸：small/default/large' },
          { name: 'rangeRef', type: 'range', description: '数据源引用' },
        ],
      },
      {
        title: '使用示例',
        body: '适用于兴趣爱好、权限选择、功能勾选等多选场景。通过 minSelect 和 maxSelect 控制选择数量范围。值为字符串数组。',
      },
    ],
  },

  // ─── 容器控件 ─────────────────────────────────────────────
  {
    id: 'form-design:form',
    slug: 'control-form',
    title: '表单窗体',
    summary: '顶层表单容器，包含标题区域和提交/重置按钮',
    sections: [
      {
        title: '属性说明',
        fields: [
          { name: 'title', type: 'string', description: '表单标题' },
          { name: 'subtitle', type: 'string', description: '表单副标题' },
          { name: 'width', type: 'number', description: '宽度' },
          { name: 'height', type: 'number', description: '高度' },
          { name: 'background', type: 'color', description: '背景色' },
          { name: 'padding', type: 'number', description: '内边距' },
          { name: 'borderRadius', type: 'number', description: '圆角' },
          { name: 'submitText', type: 'string', description: '提交按钮文本' },
          { name: 'resetText', type: 'string', description: '重置按钮文本' },
          { name: 'showFooter', type: 'boolean', description: '是否显示底栏按钮' },
        ],
      },
      {
        title: '使用示例',
        body: '作为表单的顶层容器，所有其他控件都应放置在表单窗体内。支持 onSubmit 和 onReset 事件，分别在用户点击提交和重置按钮时触发。',
      },
    ],
  },
  {
    id: 'form-design:container',
    slug: 'control-container',
    title: '容器',
    summary: '通用布局容器，用于分组和组织控件',
    sections: [
      {
        title: '属性说明',
        fields: [
          { name: 'title', type: 'string', description: '容器标题' },
          { name: 'subtitle', type: 'string', description: '容器副标题' },
          { name: 'name', type: 'string', description: '字段名' },
          { name: 'background', type: 'color', description: '背景色' },
          { name: 'borderRadius', type: 'number', description: '圆角（0-50）' },
          { name: 'padding', type: 'number', description: '内边距（0-50）' },
        ],
      },
      {
        title: '使用示例',
        body: '用于将相关控件分组，提供视觉上的逻辑分区。可以嵌套使用以构建复杂的表单布局。',
      },
    ],
  },
  {
    id: 'form-design:card',
    slug: 'control-card',
    title: '卡片',
    summary: '卡片容器，支持阴影、边框和拖放事件',
    sections: [
      {
        title: '属性说明',
        fields: [
          { name: 'title', type: 'string', description: '卡片标题' },
          { name: 'subtitle', type: 'string', description: '卡片副标题' },
          { name: 'name', type: 'string', description: '字段名' },
          { name: 'background', type: 'color', description: '背景色' },
          { name: 'borderRadius', type: 'number', description: '圆角（0-50）' },
          { name: 'padding', type: 'number', description: '内边距（0-50）' },
          { name: 'shadow', type: 'boolean', description: '是否显示阴影' },
          { name: 'borderColor', type: 'color', description: '边框颜色' },
          { name: 'rangeRef', type: 'range', description: '数据源引用' },
        ],
      },
      {
        title: '使用示例',
        body: '适用于需要卡片式布局的控件分组。支持 onDrop 事件，可接收拖放操作。相比普通容器，卡片支持阴影和边框样式自定义。',
      },
    ],
  },
  {
    id: 'form-design:tabs',
    slug: 'control-tabs',
    title: '标签页',
    summary: '标签页容器，支持分段、下划线和胶囊三种样式',
    sections: [
      {
        title: '属性说明',
        fields: [
          { name: 'tabs', type: 'json', description: '标签名数组，如 ["选项一", "选项二"]' },
          { name: 'defaultTab', type: 'number', description: '默认选中的标签索引' },
          { name: 'name', type: 'string', description: '字段名' },
          { name: 'style', type: 'select', description: '样式：segmented/underline/pill' },
          { name: 'activeColor', type: 'color', description: '激活标签颜色' },
          { name: 'inactiveColor', type: 'color', description: '未激活标签颜色' },
        ],
      },
      {
        title: '使用示例',
        body: '适用于多步骤表单分区、不同类别内容切换等场景。支持 onTabChange 事件，回调包含索引和标签名。每个标签页可放置不同的控件。',
      },
    ],
  },
  {
    id: 'form-design:steps',
    slug: 'control-steps',
    title: '步骤条',
    summary: '步骤条容器，展示多步骤流程的进度',
    sections: [
      {
        title: '属性说明',
        fields: [
          { name: 'steps', type: 'json', description: '步骤名数组，如 ["开始", "处理", "完成"]' },
          { name: 'defaultStep', type: 'number', description: '默认激活步骤索引' },
          { name: 'name', type: 'string', description: '字段名' },
          { name: 'activeColor', type: 'color', description: '激活步骤颜色' },
          { name: 'inactiveColor', type: 'color', description: '未激活步骤颜色' },
        ],
      },
      {
        title: '使用示例',
        body: '适用于注册流程、审批流程、订单流程等多步骤场景。支持 onChange 事件，点击步骤时触发。已完成步骤显示勾号。',
      },
    ],
  },
  {
    id: 'form-design:divider',
    slug: 'control-divider',
    title: '分割线',
    summary: '分割线控件，用于控件之间的视觉分隔',
    sections: [
      {
        title: '属性说明',
        fields: [
          { name: 'orientation', type: 'select', description: '方向：horizontal/vertical' },
          { name: 'color', type: 'color', description: '线条颜色' },
          { name: 'thickness', type: 'number', description: '线条粗细（0.5-5）' },
          { name: 'margin', type: 'number', description: '上下/左右间距（0-50）' },
        ],
      },
      {
        title: '使用示例',
        body: '用于在表单控件之间添加视觉分隔，提升表单的可读性。支持水平和垂直两个方向。',
      },
    ],
  },

  // ─── 展示控件 ─────────────────────────────────────────────
  {
    id: 'form-design:text',
    slug: 'control-text',
    title: '文本',
    summary: '静态文本展示控件，支持丰富的文字样式配置',
    sections: [
      {
        title: '属性说明',
        fields: [
          { name: 'content', type: 'string', description: '文本内容' },
          { name: 'name', type: 'string', description: '字段名' },
          { name: 'fontSize', type: 'number', description: '字号（8-72）' },
          { name: 'fontWeight', type: 'select', description: '字重：300/normal/500/600/bold' },
          { name: 'fontFamily', type: 'select', description: '字体：默认/等宽/衬线/无衬线' },
          { name: 'color', type: 'color', description: '文字颜色' },
          { name: 'textAlign', type: 'select', description: '对齐方式：left/center/right' },
          { name: 'letterSpacing', type: 'number', description: '字间距（-2 到 10）' },
          { name: 'lineHeight', type: 'number', description: '行高（1-3）' },
          { name: 'textDecoration', type: 'select', description: '装饰：none/underline/line-through/overline' },
          { name: 'rangeRef', type: 'range', description: '数据源引用' },
        ],
      },
      {
        title: '使用示例',
        body: '适用于表单标题、说明文字、提示信息等静态文本展示。不参与表单数据提交，仅用于展示。',
      },
    ],
  },
  {
    id: 'form-design:image',
    slug: 'control-image',
    title: '图片',
    summary: '图片展示控件，支持填充方式和透明度配置',
    sections: [
      {
        title: '属性说明',
        fields: [
          { name: 'src', type: 'string', description: '图片 URL' },
          { name: 'alt', type: 'string', description: '替代文本' },
          { name: 'name', type: 'string', description: '字段名' },
          { name: 'fit', type: 'select', description: '填充方式：cover/contain/fill/scale-down' },
          { name: 'borderRadius', type: 'number', description: '圆角（0-100）' },
          { name: 'opacity', type: 'number', description: '透明度（0-1）' },
          { name: 'rangeRef', type: 'range', description: '数据源引用' },
        ],
      },
      {
        title: '使用示例',
        body: '适用于 Logo、产品图、宣传图等图片展示场景。支持 onClick 事件，点击图片时触发。fit 属性控制图片在容器中的填充方式。',
      },
    ],
  },
  {
    id: 'form-design:table',
    slug: 'control-table',
    title: '数据表格',
    summary: '数据表格展示控件，支持斑马纹和行点击事件',
    sections: [
      {
        title: '属性说明',
        fields: [
          { name: 'columns', type: 'json', description: '列名数组，如 ["名称", "类型", "状态"]' },
          { name: 'rows', type: 'number', description: '占位行数（1-50）' },
          { name: 'name', type: 'string', description: '字段名' },
          { name: 'headerBackground', type: 'color', description: '表头背景色' },
          { name: 'headerColor', type: 'color', description: '表头文字颜色' },
          { name: 'headerFontWeight', type: 'select', description: '表头字重：400/500/600' },
          { name: 'cellColor', type: 'color', description: '单元格文字颜色' },
          { name: 'showGrid', type: 'boolean', description: '是否显示网格线' },
          { name: 'striped', type: 'boolean', description: '是否显示斑马纹' },
          { name: 'rangeRef', type: 'range', description: '数据源引用' },
        ],
      },
      {
        title: '使用示例',
        body: '适用于数据列表、明细展示等场景。支持 onRowClick 事件，点击行时触发并返回行索引和行数据。可通过数据源绑定动态数据。',
      },
    ],
  },
  {
    id: 'form-design:chart',
    slug: 'control-chart',
    title: '图表',
    summary: '图表展示控件，支持柱状图、折线图、饼图等多种类型',
    sections: [
      {
        title: '属性说明',
        fields: [
          { name: 'chartType', type: 'select', description: '图表类型：bar/line/pie/doughnut/area' },
          { name: 'title', type: 'string', description: '图表标题' },
          { name: 'name', type: 'string', description: '字段名' },
          { name: 'chartData', type: 'json', description: '自定义数据（JSON）' },
          { name: 'barColor', type: 'color', description: '主色' },
          { name: 'lineColor', type: 'color', description: '辅色' },
          { name: 'showLegend', type: 'boolean', description: '是否显示图例' },
          { name: 'showValues', type: 'boolean', description: '是否显示数值' },
          { name: 'rangeRef', type: 'range', description: '数据源引用' },
        ],
      },
      {
        title: '使用示例',
        body: '适用于数据可视化展示，如销售统计、趋势分析等。支持从数据源自动推断维度和指标，也可通过 dimensions 和 metrics 手动配置。支持 onClick 事件。',
      },
    ],
  },
];
