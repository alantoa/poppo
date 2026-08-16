require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'UniversalTooltip'
  s.version        = package['version']
  s.summary        = package['description']
  s.description    = package['description']
  s.license        = package['license']
  s.author         = package['author']
  s.homepage       = package['homepage']
  s.platform       = :ios, '16.4'
  s.swift_version  = '5.9'
  s.source         = { git: 'https://github.com/alantoa/universal-tooltip' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.dependency 'Popovers', '~> 1.3.0'
  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
  
  s.source_files = "**/*.{h,m,swift}"
end
