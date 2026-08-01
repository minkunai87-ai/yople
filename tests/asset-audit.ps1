$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$textFiles = @(Get-ChildItem -LiteralPath $root -Filter '*.txt' -File)
if ($textFiles.Count -ne 1) { throw "Expected exactly one TXT deck, found $($textFiles.Count)" }
$textPath = $textFiles[0].FullName
$imagePath = Join-Path $root 'images'
$text = Get-Content -LiteralPath $textPath -Raw -Encoding utf8
$cardLines = @($text -split "`r?`n" | Where-Object { $_ -and -not $_.StartsWith('#') })
$matches = [regex]::Matches($text, '(?i)([^"''<>\t\r\n/\\]+\.(?:jpg|jpeg|png|gif|svg|webp))')
$references = @($matches | ForEach-Object { [Uri]::UnescapeDataString($_.Groups[1].Value.Trim()) } | Sort-Object -Unique)
$files = @(Get-ChildItem -LiteralPath $imagePath -File)
$fileNames = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
$files.Name | ForEach-Object { [void]$fileNames.Add($_) }
$missing = @($references | Where-Object { -not $fileNames.Contains($_) })
$unreferenced = @($files.Name | Where-Object { $_ -notin $references })
$result = [ordered]@{
    cardLines = $cardLines.Count
    imageFiles = $files.Count
    referenceOccurrences = $matches.Count
    uniqueReferences = $references.Count
    missingCount = $missing.Count
    unreferencedCount = $unreferenced.Count
    missing = $missing
}
$result | ConvertTo-Json -Depth 3
if ($missing.Count -gt 0 -or $cardLines.Count -eq 0) { exit 1 }
