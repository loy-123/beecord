# beecord themed installer (WPF GUI, celestial/imgui look).
# Runs the existing data\install.js under the hood. Launch via beecord-installer.bat.
[CmdletBinding()] param()
$ErrorActionPreference = "Stop"
try {
    Add-Type -AssemblyName PresentationFramework, PresentationCore, WindowsBase, System.Xaml | Out-Null

    # ---- paths (works both as a .ps1 and as a compiled .exe, from any start folder) ----
    # Collect every place the beecord folder might be, then search each (and up to 5 parents) for data\install.js.
    $cands = New-Object System.Collections.Generic.List[string]
    if ($PSScriptRoot) { $cands.Add($PSScriptRoot) }
    if ($PSCommandPath) { try { $cands.Add((Split-Path -Parent $PSCommandPath)) } catch {} }
    try { $cands.Add((Split-Path -Parent ([System.Diagnostics.Process]::GetCurrentProcess()).MainModule.FileName)) } catch {}
    try { $cands.Add([System.IO.Directory]::GetCurrentDirectory()) } catch {}
    try { $cands.Add((Get-Location).Path) } catch {}
    $scriptDir = if ($cands.Count) { $cands[0] } else { (Get-Location).Path }
    $root = $null
    foreach ($start in $cands) {
        if (-not $start) { continue }
        $d = $start
        for ($i = 0; $i -lt 5 -and $d; $i++) {
            if (Test-Path (Join-Path $d "data\install.js")) { $root = $d; break }
            $d = Split-Path -Parent $d
        }
        if ($root) { break }
    }
    if (-not $root) { $root = $scriptDir }
    $installJs = Join-Path $root "data\install.js"
    $fontFile = Join-Path $root "assets\fonts\JetBrainsMono.ttf"
    $iconFile = Join-Path $root "assets\beecord.ico"

    $fontRef = "Consolas"
    if (Test-Path $fontFile) {
        $uri = "file:///" + ($root -replace '\\', '/') + "/assets/fonts/#JetBrains Mono"
        $fontRef = "$uri, Consolas, Courier New"
    }

    # ---- resolve node ----
    $nodeExe = $null
    try { $nodeExe = (Get-Command node -ErrorAction SilentlyContinue).Source } catch {}
    if (-not $nodeExe) {
        foreach ($p in @("$env:ProgramFiles\nodejs\node.exe", "${env:ProgramFiles(x86)}\nodejs\node.exe", "$env:LOCALAPPDATA\Programs\nodejs\node.exe")) {
            if (Test-Path $p) { $nodeExe = $p; break }
        }
    }

    # ---- XAML ----
    $xaml = @'
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        Title="beecord installer" Width="780" Height="546" WindowStartupLocation="CenterScreen"
        WindowStyle="None" AllowsTransparency="True" Background="Transparent" ResizeMode="NoResize"
        FontFamily="__FONT__" SnapsToDevicePixels="True" TextOptions.TextFormattingMode="Display">
  <Window.Resources>
    <Style x:Key="Ghost" TargetType="Button">
      <Setter Property="Foreground" Value="#AAB1BD"/>
      <Setter Property="Background" Value="#181818"/>
      <Setter Property="BorderBrush" Value="#262626"/>
      <Setter Property="Height" Value="30"/>
      <Setter Property="Padding" Value="15,0"/>
      <Setter Property="FontSize" Value="12"/>
      <Setter Property="FontWeight" Value="SemiBold"/>
      <Setter Property="Cursor" Value="Hand"/>
      <Setter Property="SnapsToDevicePixels" Value="True"/>
      <Setter Property="Template">
        <Setter.Value>
          <ControlTemplate TargetType="Button">
            <Border x:Name="b" CornerRadius="5" Background="{TemplateBinding Background}" BorderBrush="{TemplateBinding BorderBrush}" BorderThickness="1" Padding="{TemplateBinding Padding}">
              <ContentPresenter HorizontalAlignment="Center" VerticalAlignment="Center"/>
            </Border>
            <ControlTemplate.Triggers>
              <Trigger Property="IsMouseOver" Value="True">
                <Setter TargetName="b" Property="Background" Value="#1D1D1D"/>
                <Setter TargetName="b" Property="BorderBrush" Value="#3E3E3E"/>
                <Setter Property="Foreground" Value="#E8ECF2"/>
              </Trigger>
              <Trigger Property="IsEnabled" Value="False"><Setter Property="Opacity" Value="0.4"/></Trigger>
            </ControlTemplate.Triggers>
          </ControlTemplate>
        </Setter.Value>
      </Setter>
    </Style>
    <Style x:Key="Accent" TargetType="Button">
      <Setter Property="Foreground" Value="#0F1216"/>
      <Setter Property="Background" Value="#9DBFEA"/>
      <Setter Property="Height" Value="30"/>
      <Setter Property="Padding" Value="18,0"/>
      <Setter Property="FontSize" Value="12"/>
      <Setter Property="FontWeight" Value="Bold"/>
      <Setter Property="Cursor" Value="Hand"/>
      <Setter Property="Template">
        <Setter.Value>
          <ControlTemplate TargetType="Button">
            <Border x:Name="b" CornerRadius="5" Background="{TemplateBinding Background}">
              <ContentPresenter HorizontalAlignment="Center" VerticalAlignment="Center"/>
            </Border>
            <ControlTemplate.Triggers>
              <Trigger Property="IsMouseOver" Value="True"><Setter TargetName="b" Property="Background" Value="#B0CBEE"/></Trigger>
              <Trigger Property="IsPressed" Value="True"><Setter TargetName="b" Property="Background" Value="#8AA8CE"/></Trigger>
              <Trigger Property="IsEnabled" Value="False"><Setter Property="Opacity" Value="0.4"/></Trigger>
            </ControlTemplate.Triggers>
          </ControlTemplate>
        </Setter.Value>
      </Setter>
    </Style>
    <Style x:Key="CloseBtn" TargetType="Button">
      <Setter Property="Foreground" Value="#7C8390"/>
      <Setter Property="Background" Value="Transparent"/>
      <Setter Property="Width" Value="26"/><Setter Property="Height" Value="26"/>
      <Setter Property="FontSize" Value="13"/><Setter Property="Cursor" Value="Hand"/>
      <Setter Property="Template">
        <Setter.Value>
          <ControlTemplate TargetType="Button">
            <Border x:Name="b" CornerRadius="6" Background="{TemplateBinding Background}" BorderBrush="#262626" BorderThickness="1">
              <ContentPresenter HorizontalAlignment="Center" VerticalAlignment="Center"/>
            </Border>
            <ControlTemplate.Triggers>
              <Trigger Property="IsMouseOver" Value="True"><Setter TargetName="b" Property="Background" Value="#1D1D1D"/><Setter Property="Foreground" Value="#E88080"/></Trigger>
            </ControlTemplate.Triggers>
          </ControlTemplate>
        </Setter.Value>
      </Setter>
    </Style>
  </Window.Resources>

  <Border CornerRadius="10" Background="#0C0C0C" BorderBrush="#202020" BorderThickness="1">
    <Border.Effect><DropShadowEffect BlurRadius="30" ShadowDepth="0" Opacity="0.55" Color="#000000"/></Border.Effect>
    <Grid>
      <Canvas x:Name="Stars" ClipToBounds="True"/>
      <Grid>
        <Grid.ColumnDefinitions><ColumnDefinition Width="152"/><ColumnDefinition Width="*"/></Grid.ColumnDefinitions>

        <!-- sidebar / drag handle -->
        <Border x:Name="DragArea" Grid.Column="0" BorderBrush="#161616" BorderThickness="0,0,1,0">
          <DockPanel Margin="16,18,12,14">
            <StackPanel DockPanel.Dock="Top" Orientation="Horizontal">
              <Border Width="9" Height="9" CornerRadius="2" Background="#9DBFEA" VerticalAlignment="Center">
                <Border.Effect><DropShadowEffect BlurRadius="10" ShadowDepth="0" Color="#9DBFEA" Opacity="0.8"/></Border.Effect>
              </Border>
              <TextBlock Margin="9,0,0,0" FontSize="17" FontWeight="Bold" VerticalAlignment="Center"><Run Text="bee" Foreground="#E8ECF2"/><Run Text="cord" Foreground="#9DBFEA"/></TextBlock>
            </StackPanel>
            <TextBlock x:Name="FootVer" DockPanel.Dock="Bottom" Text="installer" Foreground="#4A505C" FontSize="10"/>
            <StackPanel Margin="0,26,0,0">
              <TextBlock Text="SETUP" Foreground="#4A505C" FontSize="10" FontWeight="SemiBold" Margin="2,0,0,10"/>
              <Border x:Name="Step1" CornerRadius="6" Padding="8,6" Margin="0,0,0,3" Background="#14191F">
                <StackPanel Orientation="Horizontal"><Ellipse x:Name="Step1Dot" Width="7" Height="7" Fill="#9DBFEA" VerticalAlignment="Center"/><TextBlock x:Name="Step1Txt" Margin="9,0,0,0" Text="Checks" Foreground="#9DBFEA" FontSize="12.5" VerticalAlignment="Center"/></StackPanel>
              </Border>
              <Border x:Name="Step2" CornerRadius="6" Padding="8,6" Margin="0,0,0,3">
                <StackPanel Orientation="Horizontal"><Ellipse x:Name="Step2Dot" Width="7" Height="7" Fill="#3E3E3E" VerticalAlignment="Center"/><TextBlock x:Name="Step2Txt" Margin="9,0,0,0" Text="Install" Foreground="#646B78" FontSize="12.5" VerticalAlignment="Center"/></StackPanel>
              </Border>
              <Border x:Name="Step3" CornerRadius="6" Padding="8,6">
                <StackPanel Orientation="Horizontal"><Ellipse x:Name="Step3Dot" Width="7" Height="7" Fill="#3E3E3E" VerticalAlignment="Center"/><TextBlock x:Name="Step3Txt" Margin="9,0,0,0" Text="Done" Foreground="#646B78" FontSize="12.5" VerticalAlignment="Center"/></StackPanel>
              </Border>
            </StackPanel>
          </DockPanel>
        </Border>

        <!-- content -->
        <Grid Grid.Column="1" Margin="20,18,20,18">
          <Grid.RowDefinitions>
            <RowDefinition Height="Auto"/><RowDefinition Height="Auto"/><RowDefinition Height="*"/><RowDefinition Height="Auto"/>
          </Grid.RowDefinitions>

          <StackPanel Grid.Row="0" Margin="0,0,0,12">
            <TextBlock Text="Install beecord" FontSize="18" FontWeight="Bold" Foreground="#E8ECF2"/>
            <TextBlock x:Name="Subtitle" Text="Plugins and themes for the Discord desktop app." FontSize="11.5" Foreground="#646B78" Margin="0,3,0,0"/>
          </StackPanel>

          <Border Grid.Row="1" CornerRadius="8" Background="#0D0D0D" BorderBrush="#161616" BorderThickness="1" Padding="12,9" Margin="0,0,0,10">
            <StackPanel>
              <Grid Margin="0,3">
                <Grid.ColumnDefinitions><ColumnDefinition Width="Auto"/><ColumnDefinition Width="Auto"/><ColumnDefinition Width="*"/></Grid.ColumnDefinitions>
                <Ellipse x:Name="NodeDot" Grid.Column="0" Width="8" Height="8" Fill="#646B78" VerticalAlignment="Center"/>
                <TextBlock Grid.Column="1" Text="Node.js" Foreground="#AAB1BD" FontSize="12" Margin="9,0,0,0" VerticalAlignment="Center"/>
                <TextBlock x:Name="NodeVal" Grid.Column="2" Text="checking..." Foreground="#646B78" FontSize="11.5" HorizontalAlignment="Right" VerticalAlignment="Center"/>
              </Grid>
              <Border Height="1" Background="#161616" Margin="0,5"/>
              <Grid Margin="0,3">
                <Grid.ColumnDefinitions><ColumnDefinition Width="Auto"/><ColumnDefinition Width="Auto"/><ColumnDefinition Width="*"/></Grid.ColumnDefinitions>
                <Ellipse x:Name="DiscordDot" Grid.Column="0" Width="8" Height="8" Fill="#646B78" VerticalAlignment="Center"/>
                <TextBlock Grid.Column="1" Text="Discord" Foreground="#AAB1BD" FontSize="12" Margin="9,0,0,0" VerticalAlignment="Center"/>
                <TextBlock x:Name="DiscordVal" Grid.Column="2" Text="checking..." Foreground="#646B78" FontSize="11.5" HorizontalAlignment="Right" VerticalAlignment="Center"/>
              </Grid>
            </StackPanel>
          </Border>

          <Border Grid.Row="2" CornerRadius="6" Background="#0B0B0B" BorderBrush="#161616" BorderThickness="1">
            <TextBox x:Name="Log" IsReadOnly="True" TextWrapping="Wrap" VerticalScrollBarVisibility="Auto"
                     Background="Transparent" Foreground="#AAB1BD" BorderThickness="0" FontSize="11.5" Padding="10"
                     IsTabStop="False" Text="Ready. Click Install to patch Discord with beecord."/>
          </Border>

          <Grid Grid.Row="3" Margin="0,12,0,0">
            <StackPanel Orientation="Horizontal" HorizontalAlignment="Left">
              <Button x:Name="InstallBtn" Style="{StaticResource Accent}" Content="Install"/>
              <Button x:Name="UninstallBtn" Style="{StaticResource Ghost}" Content="Uninstall" Margin="8,0,0,0"/>
              <Button x:Name="LogBtn" Style="{StaticResource Ghost}" Content="Show log" Margin="8,0,0,0"/>
            </StackPanel>
            <Button x:Name="FolderBtn" Style="{StaticResource Ghost}" Content="Open folder" HorizontalAlignment="Right"/>
          </Grid>
        </Grid>
      </Grid>

      <Button x:Name="CloseBtn" Style="{StaticResource CloseBtn}" Content="&#x2715;" HorizontalAlignment="Right" VerticalAlignment="Top" Margin="0,10,12,0"/>
    </Grid>
  </Border>
</Window>
'@
    $xaml = $xaml.Replace("__FONT__", $fontRef)

    $reader = New-Object System.Xml.XmlNodeReader ([xml]$xaml)
    $window = [Windows.Markup.XamlReader]::Load($reader)

    # ---- find controls ----
    $C = @{}
    foreach ($n in "Stars", "DragArea", "FootVer", "Step1", "Step1Dot", "Step1Txt", "Step2", "Step2Dot", "Step2Txt", "Step3", "Step3Dot", "Step3Txt", "Subtitle", "NodeDot", "NodeVal", "DiscordDot", "DiscordVal", "Log", "InstallBtn", "UninstallBtn", "LogBtn", "FolderBtn", "CloseBtn") {
        $C[$n] = $window.FindName($n)
    }

    try { if (Test-Path $iconFile) { $window.Icon = New-Object System.Windows.Media.Imaging.BitmapImage ([Uri]$iconFile) } } catch {}

    # ---- helpers ----
    $script:running = $false
    $brush = { param($hex) (New-Object System.Windows.Media.BrushConverter).ConvertFromString($hex) }
    function Set-Dot($dot, $val, $hex) { $dot.Fill = (& $brush $hex); $val.Foreground = (& $brush $hex) }
    function Add-Log($text) { $C.Log.AppendText("`r`n" + $text); $C.Log.ScrollToEnd() }
    function Set-Step($n, $state) {
        # state: active (accent), done (green), idle (dim)
        $dot = $C["Step${n}Dot"]; $txt = $C["Step${n}Txt"]; $card = $C["Step$n"]
        if ($state -eq "active") { $dot.Fill = (& $brush "#9DBFEA"); $txt.Foreground = (& $brush "#9DBFEA"); $card.Background = (& $brush "#14191F") }
        elseif ($state -eq "done") { $dot.Fill = (& $brush "#80D09C"); $txt.Foreground = (& $brush "#80D09C"); $card.Background = (& $brush "#0F1512") }
        else { $dot.Fill = (& $brush "#3E3E3E"); $txt.Foreground = (& $brush "#646B78"); $card.Background = [System.Windows.Media.Brushes]::Transparent }
    }

    # ---- checks ----
    $nodeOk = $false
    if ($nodeExe) {
        try { $v = (& $nodeExe -v) 2>$null; $C.NodeVal.Text = "$v"; Set-Dot $C.NodeDot $C.NodeVal "#80D09C"; $nodeOk = $true }
        catch { $C.NodeVal.Text = "found"; Set-Dot $C.NodeDot $C.NodeVal "#80D09C"; $nodeOk = $true }
    } else {
        $C.NodeVal.Text = "not found - get it at nodejs.org"; Set-Dot $C.NodeDot $C.NodeVal "#E88080"
    }

    $discordApps = @()
    try { $discordApps = Get-ChildItem "$env:LOCALAPPDATA\Discord\app-*" -Directory -ErrorAction SilentlyContinue | Sort-Object Name } catch {}
    if ($discordApps.Count) {
        $C.DiscordVal.Text = ($discordApps[-1].Name -replace '^app-', 'v'); Set-Dot $C.DiscordDot $C.DiscordVal "#80D09C"
    } else {
        $C.DiscordVal.Text = "not found - install & open Discord once"; Set-Dot $C.DiscordDot $C.DiscordVal "#E8C478"
    }

    if (-not (Test-Path $installJs)) {
        $C.Subtitle.Text = "Couldn't find beecord's files. Keep this installer inside the beecord folder (next to the 'data' folder)."
        $C.Subtitle.Foreground = (& $brush "#E88080")
        Add-Log ("Looked for data\install.js near: " + $scriptDir)
        Add-Log "Move beecord-installer.exe into the extracted beecord folder (the one containing 'data', 'plugins', 'assets') and reopen it."
    }
    $C.FootVer.Text = "node " + ($(if ($nodeOk) { "ok" } else { "missing" }))
    if (-not ($nodeOk -and (Test-Path $installJs))) { $C.InstallBtn.IsEnabled = $false; $C.UninstallBtn.IsEnabled = $false; $C.LogBtn.IsEnabled = $false }

    # ---- run node (streamed into the log via a background runspace + UI timer) ----
    $script:queue = [System.Collections.Queue]::Synchronized((New-Object System.Collections.Queue))
    $script:psRun = $null
    $script:psAsync = $null
    $script:timer = New-Object System.Windows.Threading.DispatcherTimer
    $script:timer.Interval = [TimeSpan]::FromMilliseconds(100)
    $script:onDone = $null

    $script:timer.Add_Tick({
        while ($script:queue.Count -gt 0) {
            $line = $script:queue.Dequeue()
            if ($line -like "::EXIT::*") {
                $script:timer.Stop()
                $code = 0; try { $code = [int]($line -replace '::EXIT::', '') } catch {}
                try { if ($script:psRun) { $script:psRun.EndInvoke($script:psAsync) | Out-Null; $script:psRun.Runspace.Close(); $script:psRun.Dispose() } } catch {}
                $script:psRun = $null
                $script:running = $false
                $C.InstallBtn.IsEnabled = $true; $C.UninstallBtn.IsEnabled = $true; $C.LogBtn.IsEnabled = $true
                if ($script:onDone) { & $script:onDone $code }
                return
            }
            Add-Log $line
        }
    })

    function Start-Node($argList, $onDone) {
        if ($script:running) { return }
        $script:running = $true
        $script:onDone = $onDone
        $C.InstallBtn.IsEnabled = $false; $C.UninstallBtn.IsEnabled = $false; $C.LogBtn.IsEnabled = $false
        $rs = [RunspaceFactory]::CreateRunspace(); $rs.ApartmentState = "MTA"; $rs.Open()
        $rs.SessionStateProxy.SetVariable("q", $script:queue)
        $rs.SessionStateProxy.SetVariable("nodeExe", $nodeExe)
        $rs.SessionStateProxy.SetVariable("argList", $argList)
        $rs.SessionStateProxy.SetVariable("wd", $root)
        $ps = [PowerShell]::Create(); $ps.Runspace = $rs
        $ps.AddScript({
            param()
            try {
                Set-Location $wd
                & $nodeExe @argList 2>&1 | ForEach-Object { $q.Enqueue([string]$_) }
                $q.Enqueue("::EXIT::" + $LASTEXITCODE)
            } catch { $q.Enqueue("Error: " + $_.Exception.Message); $q.Enqueue("::EXIT::1") }
        }) | Out-Null
        $script:psRun = $ps
        $script:psAsync = $ps.BeginInvoke()
        $script:timer.Start()
    }

    # ---- buttons ----
    $C.InstallBtn.Add_Click({
        $C.Log.Text = "Installing beecord..."
        Set-Step 1 "done"; Set-Step 2 "active"; Set-Step 3 "idle"
        $C.Subtitle.Text = "Patching Discord. It will restart automatically."
        $C.Subtitle.Foreground = (& $brush "#646B78")
        Start-Node @($installJs) {
            param($code)
            if ($code -eq 0) {
                Set-Step 2 "done"; Set-Step 3 "done"
                $C.Subtitle.Text = "Installed. Open Discord > Settings > beecord."
                $C.Subtitle.Foreground = (& $brush "#80D09C")
                Add-Log "`r`nDone. beecord is installed."
            } else {
                Set-Step 2 "idle"
                $C.Subtitle.Text = "Install failed (exit $code). See the log above."
                $C.Subtitle.Foreground = (& $brush "#E88080")
            }
        }
    })
    $C.UninstallBtn.Add_Click({
        $C.Log.Text = "Uninstalling beecord..."
        Set-Step 1 "active"; Set-Step 2 "idle"; Set-Step 3 "idle"
        Start-Node @($installJs, "uninstall") {
            param($code)
            $C.Subtitle.Text = if ($code -eq 0) { "Uninstalled. Discord restored." } else { "Uninstall finished with exit $code." }
            $C.Subtitle.Foreground = (& $brush $(if ($code -eq 0) { "#80D09C" } else { "#E8C478" }))
        }
    })
    $C.LogBtn.Add_Click({
        $C.Log.Text = "Reading beecord log..."
        Start-Node @($installJs, "log") { param($code) }
    })
    $C.FolderBtn.Add_Click({
        $target = Join-Path $env:APPDATA "beecord"
        if (-not (Test-Path $target)) { $target = $root }
        try { Start-Process explorer.exe $target } catch {}
    })
    $C.CloseBtn.Add_Click({ $window.Close() })
    $C.DragArea.Add_MouseLeftButtonDown({ try { $window.DragMove() } catch {} })

    # ---- starfield ----
    try {
        $rng = New-Object System.Random
        $script:stars = @()
        for ($i = 0; $i -lt 70; $i++) {
            $e = New-Object System.Windows.Shapes.Ellipse
            $sz = 0.8 + $rng.NextDouble() * 1.6
            $e.Width = $sz; $e.Height = $sz
            $accent = $rng.NextDouble() -lt 0.28
            $e.Fill = (& $brush $(if ($accent) { "#9DBFEA" } else { "#FAFAFA" }))
            $op = 0.08 + $rng.NextDouble() * 0.4
            $e.Opacity = $op
            [System.Windows.Controls.Canvas]::SetLeft($e, $rng.NextDouble() * 760)
            [System.Windows.Controls.Canvas]::SetTop($e, $rng.NextDouble() * 540)
            $C.Stars.Children.Add($e) | Out-Null
            $script:stars += [pscustomobject]@{ El = $e; Base = $op; Phase = $rng.NextDouble() * 6.28; Speed = 0.6 + $rng.NextDouble() * 1.6 }
        }
        $script:t0 = Get-Date
        $twinkle = New-Object System.Windows.Threading.DispatcherTimer
        $twinkle.Interval = [TimeSpan]::FromMilliseconds(60)
        $twinkle.Add_Tick({
            $t = ((Get-Date) - $script:t0).TotalSeconds
            foreach ($s in $script:stars) { $s.El.Opacity = $s.Base * (0.45 + 0.55 * (0.5 + 0.5 * [Math]::Sin($t * $s.Speed + $s.Phase))) }
        })
        $twinkle.Start()
        $window.Add_Closed({ try { $twinkle.Stop() } catch {}; try { $script:timer.Stop() } catch {} })
    } catch {}

    $window.Add_Closing({ try { if ($script:psRun) { $script:psRun.Stop() } } catch {} })
    [void]$window.ShowDialog()
} catch {
    [System.Windows.MessageBox]::Show("beecord installer could not start:`n`n" + $_.Exception.Message, "beecord", "OK", "Error") | Out-Null
}
